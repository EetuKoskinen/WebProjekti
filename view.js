import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);

// Tiedot tallennetaan tänne
let me = null;             // kirjautunut opiskelija
let teacherId = null;
let currentStudent = null; // opiskelija, jonka sivu on auki (opettaja)
let tasks = [];
let submissions = [];
let students = [];
let messages = [];

//  Apufunktiot

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('fi-FI') : '-';
}

// Hakee tiedot tietokannasta. virhe heitetään eteenpäin
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
  $('loading').hidden = true;
  $('errorBox').hidden = true;
  $(id).hidden = false;
}

function showError(text) {
  $('loading').hidden = true;
  $('errorBox').textContent = text;
  $('errorBox').hidden = false;
}

// Näyttää napin vieressä onnistumisviestin tai virheen
function showResult(el, error, okText = 'Tallennettu') {
  el.textContent = error ? 'Virhe: ' + error.message : okText;
  el.className = 'msg small ' + (error ? 'error' : 'ok');
}

// Tekee kopion mallista (template)
function copyTemplate(id) {
  return $(id).content.cloneNode(true);
}

function subjectName(task) {
  return task.subjects ? task.subjects.name : 'Muu';
}

function className(student) {
  return student.classes ? student.classes.name : '';
}

// Palauttaa opiskelijan vastauksen tehtävään
function findSubmission(taskId, studentId) {
  return submissions.find(s => s.assignment_id === taskId && s.student_id === studentId);
}

$('logoutBtn').onclick = async () => {
  await supabase.auth.signOut();
  location.href = 'html.html';
};


// Aloitus 

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
      $('who').textContent = 'Opiskelija: ' + me.first_name + ' ' + me.last_name;
      await startStudent();
      return;
    }

    // Onko käyttäjä opettaja?
    const teacher = await hae(supabase.from('teachers').select('*').eq('id', userId).maybeSingle());
    if (teacher) {
      teacherId = teacher.id;
      $('who').textContent = 'Opettaja: ' + teacher.first_name + ' ' + teacher.last_name;
      await startTeacher();
      return;
    }

    showError('Käyttäjä ei ole opiskelija eikä opettaja.');
  } catch (error) {
    showError(error.message);
  }
}


// OPISKELIJA 

async function startStudent() {
  tasks = await hae(supabase.from('assignments')
    .select('id, title, description, due_date, subjects(name)').order('due_date'));
  submissions = await hae(supabase.from('submissions').select('*').eq('student_id', me.id));
  messages = await hae(supabase.from('messages').select('*')
    .eq('student_id', me.id).order('created_at', { ascending: false }));

  $('backToSubjects').onclick = showSubjects;
  showSubjects();
}

// Sivu 1: oppiaineet
function showSubjects() {
  showPage('subjectsPage');
  showMessages();
  const list = $('subjectList');
  list.innerHTML = '';
  $('noTasks').hidden = tasks.length > 0;

  // Jokainen oppiaine vain kerran, aakkosjärjestyksessä
  const names = [...new Set(tasks.map(subjectName))].sort();

  for (const name of names) {
    const subjectTasks = tasks.filter(t => subjectName(t) === name);
    const notDone = subjectTasks.filter(t => !findSubmission(t.id, me.id)).length;

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

function showMessages() {
  const list = $('messageList');
  list.innerHTML = '';
  $('messageBox').hidden = messages.length === 0;

  for (const m of messages) {
    const div = document.createElement('div');
    div.className = 'message ' + m.type + (m.is_read ? '' : ' unread');

    const head = document.createElement('div');
    head.className = 'small';
    head.textContent = (m.type === 'warning' ? '⚠ Varoitus' : 'Viesti') + ' · ' + formatDate(m.created_at);

    const body = document.createElement('div');
    body.textContent = m.body;

    div.append(head, body);
    list.appendChild(div);
  }

  markMessagesRead();
}

// Merkitään uudet viestit luetuiksi
async function markMessagesRead() {
  const unread = messages.filter(m => !m.is_read);
  if (unread.length === 0) return;

  const { error } = await supabase.from('messages')
    .update({ is_read: true })
    .in('id', unread.map(m => m.id));

  if (!error) {
    for (const m of unread) m.is_read = true;
  }
}

// Sivu 2: yhden oppiaineen tehtävät
function showSubject(name) {
  showPage('subjectPage');
  $('subjectTitle').textContent = name;
  const list = $('taskList');
  list.innerHTML = '';

  for (const task of tasks.filter(t => subjectName(t) === name)) {
    const sub = findSubmission(task.id, me.id);

    const box = copyTemplate('taskTemplate');
    box.querySelector('.title').textContent = task.title;
    box.querySelector('.description').textContent = task.description;
    box.querySelector('.due').textContent = formatDate(task.due_date);

    const textarea = box.querySelector('textarea');
    const button = box.querySelector('.submit-btn');
    textarea.value = sub ? sub.answer : '';

    if (sub && sub.status === 'graded') {
      // arvosteltua ei voi muokata
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
  const { error } = await supabase.from('submissions').upsert(
    { assignment_id: task.id, student_id: me.id, answer: answer, status: 'submitted' },
    { onConflict: 'assignment_id,student_id' }
  );

  showResult(msg, error);
  if (error) return;

  // Päivitetään oma lista
  const existing = findSubmission(task.id, me.id);
  if (existing) {
    existing.answer = answer;
  } else {
    submissions.push({ assignment_id: task.id, student_id: me.id, answer: answer, status: 'submitted' });
  }
  button.textContent = 'Päivitä vastaus';
}


// OPETTAJA 

async function startTeacher() {
  tasks = await hae(supabase.from('assignments')
    .select('id, title, due_date, class_id, subjects(name)').order('due_date'));
  submissions = await hae(supabase.from('submissions').select('*'));
  students = await hae(supabase.from('students')
    .select('id, first_name, last_name, class_id, classes(name)'));
  const subjects = await hae(supabase.from('subjects').select('id, name').order('name'));
  const classes = await hae(supabase.from('classes').select('id, name').order('name'));

  // Täytetään valintalistat uutta tehtävää varten
  for (const s of subjects) $('newSubject').add(new Option(s.name, s.id));
  for (const c of classes) $('newClass').add(new Option(c.name, c.id));

  // Napit toimivat aina samalla tavalla joten ne laitetaan kerran tässä
  $('search').oninput = showList;
  $('sortBox').onchange = showList;
  $('newTaskBtn').onclick = showNewTask;
  $('backFromStudent').onclick = showStudents;
  $('backFromNewTask').onclick = showStudents;
  $('sendMsgBtn').onclick = sendMessage;
  $('saveTaskBtn').onclick = saveTask;
  showStudents();
}

// Sivu 1: opiskelijalista ja haku
function showStudents() {
  showPage('studentsPage');
  showList();
}

// Järjestää opiskelijat joko luokan tai nimen mukaan
function sortStudents() {
  const sortBy = $('sortBox').value;

  students.sort((a, b) => {
    const byName = a.last_name.localeCompare(b.last_name, 'fi') ||
    a.first_name.localeCompare(b.first_name, 'fi');
    if (sortBy === 'name') return byName;

    // Luokan mukaan, ja saman luokan sisällä nimen mukaan
    const byClass = className(a).localeCompare(className(b), 'fi', { numeric: true });
    return byClass || byName;
  });
}

function showList() {
  const search = $('search').value.trim().toLowerCase();
  const list = $('studentList');
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
  currentStudent = s;
  $('msgText').value = '';
  $('msgResult').textContent = '';

  const list = $('studentTasks');
  list.innerHTML = '';

  const myTasks = tasks.filter(t => t.class_id === s.class_id);
  $('noStudentTasks').hidden = myTasks.length > 0;

  for (const task of myTasks) {
    const sub = findSubmission(task.id, s.id);

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

      const article = box.querySelector('.task');
      box.querySelector('.grade-btn').onclick = () => saveGrade(sub, article);
    }

    list.appendChild(box);
  }
}

async function saveGrade(sub, box) {
  const grade = box.querySelector('.grade').value;
  const feedback = box.querySelector('.feedback').value;

  const { error } = await supabase.from('submissions')
    .update({ grade: grade, feedback: feedback, status: 'graded' })
    .eq('id', sub.id);

  showResult(box.querySelector('.msg'), error);
  if (error) return;

  // Päivitetään oma lista
  sub.grade = grade;
  sub.feedback = feedback;
  sub.status = 'graded';

  // Päivitetään tilateksti sivulla
  const status = box.querySelector('.status');
  status.textContent = 'Arvosteltu';
  status.className = 'status graded';
}

async function sendMessage() {
  const msg = $('msgResult');
  const body = $('msgText').value.trim();

  if (body === '') {
    showResult(msg, { message: 'Kirjoita viesti ensin.' });
    return;
  }

  const { error } = await supabase.from('messages').insert({
    student_id: currentStudent.id,
    teacher_id: teacherId,
    type: $('msgType').value,
    body: body
  });

  showResult(msg, error, 'Lähetetty');
  if (!error) $('msgText').value = '';
}

// Sivu 3: uuden tehtävän lomake
function showNewTask() {
  showPage('newTaskPage');
  $('newTaskMsg').textContent = '';
}

async function saveTask() {
  const msg = $('newTaskMsg');
  const title = $('newTitle').value.trim();
  const description = $('newDescription').value.trim();
  const dueDate = $('newDue').value; 

  if (title === '' || description === '') {
    showResult(msg, { message: 'Täytä otsikko ja tehtävänanto.' });
    return;
  }

  // Määräaika ei saa olla menneisyydessä
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dueDate && new Date(dueDate + 'T00:00') < today) {
    showResult(msg, { message: 'Määräaika ei voi olla menneessä ajassa.' });
    return;
  }

  const { data, error } = await supabase.from('assignments')
    .insert({
      subject_id: $('newSubject').value,
      class_id: $('newClass').value,
      title: title,
      description: description,
      due_date: dueDate || null
    })
    .select('id, title, due_date, class_id, subjects(name)')
    .single();

  showResult(msg, error);
  if (error) return;

  // Lisätään omaan listaan ja tyhjennetään lomake
  tasks.push(data);
  $('newTitle').value = '';
  $('newDescription').value = '';
  $('newDue').value = '';
}

main();