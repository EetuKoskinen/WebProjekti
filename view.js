import { supabase } from './supabase.js';

const who = document.getElementById('who');

// Tiedot tallennetaan tänne
let me = null; // kirjautunut opiskelija
let tasks = [];
let submissions = [];
let students = [];


// ---------- Apufunktiot ----------

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('fi-FI') : '-';
}

// Hakee tiedot tietokannasta, virhe heitetään eteenpäin
async function hae(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
}

// Näyttää yhden sivun ja piilottaa muut
function showPage(id) {
  for (const page of document.querySelectorAll('main section')) {
    page.hidden = true;
  }
  document.getElementById('loading').hidden = true;
  document.getElementById('errorBox').hidden = true;
  document.getElementById(id).hidden = false;
}

function showError(error) {
  document.getElementById('loading').hidden = true;
  const box = document.getElementById('errorBox');
  box.textContent = error.message;
  box.hidden = false;
}

// Näyttää napin vieressä "Tallennettu" tai virheen
function showResult(el, error) {
  el.textContent = error ? 'Virhe: ' + error.message : 'Tallennettu';
  el.className = 'msg small ' + (error ? 'error' : 'ok');
}

// Tekee kopion mallista (template)
function copyTemplate(id) {
  return document.getElementById(id).content.cloneNode(true);
}

function subjectName(task) {
  return task.subjects ? task.subjects.name : 'Muu';
}

function className(student) {
  return student.classes ? student.classes.name : '';
}

document.getElementById('logoutBtn').onclick = async () => {
  await supabase.auth.signOut();
  location.href = 'html.html';
};


// ---------- Aloitus ----------

async function main() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    location.href = 'html.html';
    return;
  }
  const userId = data.session.user.id;

  try {
    // Onko käyttäjä opiskelija?
    const student = await hae(supabase.from('students').select('*').eq('id', userId).maybeSingle());
    if (student) {
      me = student;
      who.textContent = 'Opiskelija: ' + me.first_name + ' ' + me.last_name;
      await startStudent();
      return;
    }

    // Onko käyttäjä opettaja?
    const teacher = await hae(supabase.from('teachers').select('*').eq('id', userId).maybeSingle());
    if (teacher) {
      who.textContent = 'Opettaja: ' + teacher.first_name + ' ' + teacher.last_name;
      await startTeacher();
      return;
    }

    showError({ message: 'Käyttäjä ei ole opiskelija eikä opettaja.' });
  } catch (error) {
    showError(error);
  }
}


// ---------- OPISKELIJA ----------

async function startStudent() {
  tasks = await hae(supabase.from('assignments')
    .select('id, title, description, due_date, subjects(name)').order('due_date'));
  submissions = await hae(supabase.from('submissions').select('*').eq('student_id', me.id));

  document.getElementById('backToSubjects').onclick = showSubjects;
  showSubjects();
}

// Palauttaa opiskelijan vastauksen tehtävään (tai undefined)
function findSubmission(taskId) {
  return submissions.find(s => s.assignment_id === taskId);
}

// Sivu 1: oppiaineet
function showSubjects() {
  showPage('subjectsPage');
  const list = document.getElementById('subjectList');
  list.innerHTML = '';
  document.getElementById('noTasks').hidden = tasks.length > 0;

  // Kerätään jokainen oppiaine vain kerran
  const names = [];
  for (const task of tasks) {
    if (!names.includes(subjectName(task))) names.push(subjectName(task));
  }
  names.sort();

  for (const name of names) {
    const subjectTasks = tasks.filter(t => subjectName(t) === name);
    const notDone = subjectTasks.filter(t => !findSubmission(t.id)).length;

    const card = copyTemplate('subjectTemplate');
    card.querySelector('.card-title').textContent = name;
    card.querySelector('.card-sub').textContent = subjectTasks.length + ' tehtävää';

    const badge = card.querySelector('.badge');
    if (notDone > 0) {
      badge.textContent = notDone + ' tekemättä';
      badge.classList.add('warn');
    } else {
      badge.textContent = 'Kaikki palautettu';
      badge.classList.add('done');
    }

    card.querySelector('button').onclick = () => showSubject(name);
    list.appendChild(card);
  }
}

// Sivu 2: yhden oppiaineen tehtävät
function showSubject(name) {
  showPage('subjectPage');
  document.getElementById('subjectTitle').textContent = name;
  const list = document.getElementById('taskList');
  list.innerHTML = '';

  for (const task of tasks) {
    if (subjectName(task) !== name) continue;

    const sub = findSubmission(task.id);
    const isGraded = sub && sub.status === 'graded'; // arvosteltua ei voi muokata

    const box = copyTemplate('taskTemplate');
    box.querySelector('.title').textContent = task.title;
    box.querySelector('.description').textContent = task.description;
    box.querySelector('.due').textContent = formatDate(task.due_date);

    const textarea = box.querySelector('textarea');
    const button = box.querySelector('.submit-btn');
    textarea.value = sub ? sub.answer : '';

    if (isGraded) {
      textarea.disabled = true;
      button.hidden = true;
      box.querySelector('.graded').hidden = false;
      box.querySelector('.grade').textContent = sub.grade;
      box.querySelector('.feedback').textContent = sub.feedback;
    } else {
      if (sub) button.textContent = 'Päivitä vastaus';
      const msg = box.querySelector('.msg');
      button.onclick = () => submitAnswer(task, textarea, button, msg);
    }

    list.appendChild(box);
  }
}

async function submitAnswer(task, textarea, button, msg) {
  const answer = textarea.value;

  // upsert = lisää uusi tai päivitä vanha
  const result = await supabase.from('submissions').upsert(
    { assignment_id: task.id, student_id: me.id, answer: answer, status: 'submitted' },
    { onConflict: 'assignment_id,student_id' }
  );

  showResult(msg, result.error);
  if (result.error) return;

  // Päivitetään oma lista
  const existing = findSubmission(task.id);
  if (existing) {
    existing.answer = answer;
  } else {
    submissions.push({ assignment_id: task.id, student_id: me.id, answer: answer, status: 'submitted' });
  }
  button.textContent = 'Päivitä vastaus';
}


// ---------- OPETTAJA ----------

async function startTeacher() {
  tasks = await hae(supabase.from('assignments')
    .select('id, title, due_date, class_id, subjects(name)').order('due_date'));
  submissions = await hae(supabase.from('submissions').select('*'));
  students = await hae(supabase.from('students')
    .select('id, first_name, last_name, email, class_id, classes(name)').order('last_name'));
  const subjects = await hae(supabase.from('subjects').select('id, name').order('name'));
  const classes = await hae(supabase.from('classes').select('id, name').order('name'));

  // Täytetään valintalistat uutta tehtävää varten
  for (const s of subjects) {
    document.getElementById('newSubject').add(new Option(s.name, s.id));
  }
  for (const c of classes) {
    document.getElementById('newClass').add(new Option(c.name, c.id));
  }

  // Napit toimivat aina samalla tavalla, joten ne laitetaan kerran tässä
  const searchBox = document.getElementById('search');
  searchBox.oninput = () => showList(searchBox.value);
  document.getElementById('sortBox').onchange = () => showList(searchBox.value);
  document.getElementById('newTaskBtn').onclick = showNewTask;
  document.getElementById('backFromStudent').onclick = showStudents;
  document.getElementById('backFromNewTask').onclick = showStudents;
  document.getElementById('saveTaskBtn').onclick = saveTask;

  showStudents();
}

// Sivu 1: opiskelijalista ja haku
function showStudents() {
  showPage('studentsPage');
  showList(document.getElementById('search').value);
}

// Järjestää opiskelijat valinnan mukaan: luokka (7A, 7B, 8A...) tai nimi
function sortStudents() {
  const sortBy = document.getElementById('sortBox').value;

  students.sort((a, b) => {
    const byName = a.last_name.localeCompare(b.last_name, 'fi') ||
                   a.first_name.localeCompare(b.first_name, 'fi');
    if (sortBy === 'name') return byName;

    // Luokan mukaan, ja saman luokan sisällä nimen mukaan
    const byClass = className(a).localeCompare(className(b), 'fi', { numeric: true });
    return byClass || byName;
  });
}

function showList(searchText) {
  const search = searchText.trim().toLowerCase();
  const list = document.getElementById('studentList');
  list.innerHTML = '';
  sortStudents();

  for (const s of students) {
    const text = (s.first_name + ' ' + s.last_name + ' ' + className(s)).toLowerCase();
    if (!text.includes(search)) continue;

    // Kuinka monta vastausta odottaa arvostelua?
    const waiting = submissions.filter(x => x.student_id === s.id && x.status === 'submitted').length;

    const row = copyTemplate('studentRowTemplate');
    row.querySelector('.name').textContent = s.last_name + ' ' + s.first_name + ' (' + className(s) + ')';
    if (waiting > 0) {
      const badge = row.querySelector('.badge');
      badge.textContent = waiting + ' arvosteltavaa';
      badge.hidden = false;
    }
    row.querySelector('button').onclick = () => showStudent(s);
    list.appendChild(row);
  }

  if (list.innerHTML === '') list.textContent = 'Ei tuloksia.';
}

// Sivu 2: yhden opiskelijan tehtävät ja arvostelu
function showStudent(s) {
  showPage('studentPage');
  document.getElementById('studentName').textContent = s.last_name + ' ' + s.first_name;
  document.getElementById('studentEmail').textContent = s.email;

  const list = document.getElementById('studentTasks');
  list.innerHTML = '';

  const myTasks = tasks.filter(t => t.class_id === s.class_id);
  document.getElementById('noStudentTasks').hidden = myTasks.length > 0;

  for (const task of myTasks) {
    const sub = submissions.find(x => x.assignment_id === task.id && x.student_id === s.id);

    const box = copyTemplate('studentTaskTemplate');
    box.querySelector('.title').textContent = subjectName(task) + ': ' + task.title;
    box.querySelector('.due').textContent = '· ' + formatDate(task.due_date);

    if (!sub) {
      box.querySelector('.missing').hidden = false;
    } else {
      box.querySelector('.submission').hidden = false;

      const status = box.querySelector('.status');
      status.textContent = sub.status === 'graded' ? 'Arvosteltu' : 'Odottaa arvostelua';
      status.className = 'status ' + sub.status;

      box.querySelector('.answer').textContent = sub.answer;
      box.querySelector('.grade').value = sub.grade || '';
      box.querySelector('.feedback').value = sub.feedback || '';

      const gradeBtn = box.querySelector('.grade-btn');
      const article = box.querySelector('.task');
      gradeBtn.onclick = () => saveGrade(sub, article);
    }

    list.appendChild(box);
  }
}

async function saveGrade(sub, box) {
  const grade = box.querySelector('.grade').value;
  const feedback = box.querySelector('.feedback').value;

  const result = await supabase.from('submissions')
    .update({ grade: grade, feedback: feedback, status: 'graded' })
    .eq('id', sub.id);

  showResult(box.querySelector('.msg'), result.error);
  if (result.error) return;

  // Päivitetään oma lista
  sub.grade = grade;
  sub.feedback = feedback;
  sub.status = 'graded';

  // Päivitetään tilateksti sivulla
  const status = box.querySelector('.status');
  status.textContent = 'Arvosteltu';
  status.className = 'status graded';
}

// Sivu 3: uuden tehtävän lomake
function showNewTask() {
  showPage('newTaskPage');
  document.getElementById('newTaskMsg').textContent = '';
}

async function saveTask() {
  const msg = document.getElementById('newTaskMsg');
  const title = document.getElementById('newTitle').value.trim();
  const description = document.getElementById('newDescription').value.trim();
  const dueDate = document.getElementById('newDue').value;

  if (title === '' || description === '') {
    showResult(msg, { message: 'Täytä otsikko ja tehtävänanto.' });
    return;
  }
  if (dueDate) {
    const [y, m, d] = dueDate.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (due < today) {
      showResult(msg, { message: 'Määräaika ei voi olla menneessä ajassa.' });
      return;
    }
  }

  const result = await supabase.from('assignments')
    .insert({
      subject_id: document.getElementById('newSubject').value,
      class_id: document.getElementById('newClass').value,
      title: title,
      description: description,
      due_date: dueDate || null
    })
    .select('id, title, due_date, class_id, subjects(name)')
    .single();

  showResult(msg, result.error);
  if (result.error) return;

  // Lisätään omaan listaan ja tyhjennetään lomake
  tasks.push(result.data);
  document.getElementById('newTitle').value = '';
  document.getElementById('newDescription').value = '';
  document.getElementById('newDue').value = '';
}


main();