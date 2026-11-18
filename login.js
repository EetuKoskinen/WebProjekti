import { supabase } from './supabase.js';

// haetaan elementit
const message = document.getElementById('message');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const registerFields = document.getElementById('registerFields');
const roleSelect = document.getElementById('role');
const classSelect = document.getElementById('classSelect');

// Jos jo kirjautunut, siirrytään view-sivulle
async function checkSession() {
  const result = await supabase.auth.getSession();
  if (result.data.session) {
    window.location.href = 'view.html';
  }
}
checkSession();

// Kirjautuminen
async function login() {
  message.textContent = '';
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  const result = await supabase.auth.signInWithPassword({ email, password });

  if (result.error) {
    message.textContent = 'Kirjautuminen epäonnistui: ' + result.error.message;
  } else {
    window.location.href = 'view.html';
  }
}

// Tilin luonti
async function register() {
  message.textContent = '';
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const role = roleSelect.value; // 'student' tai 'teacher'

  if (firstName === '' || lastName === '') {
    message.textContent = 'Kirjoita etu- ja sukunimi.';
    return;
  }

  // vain oppilaalla on luokka
  let classId = '';
  if (role === 'student') {
    classId = classSelect.value;
  }

  const result = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        role: role,
        first_name: firstName,
        last_name: lastName,
        class_id: classId
      }
    }
  });

  if (result.error) {
    message.textContent = 'Tilin luonti epäonnistui: ' + result.error.message;
  } else if (result.data.session) {
    window.location.href = 'view.html';
  }
}

// Haetaan luokat valikkoon
async function loadClasses() {
  const result = await supabase.from('classes').select('id, name').order('name');

  if (result.error) {
    console.log('Luokkien haku epäonnistui:', result.error.message);
    return;
  }

  classSelect.innerHTML = '';
  for (const c of result.data) {
    classSelect.innerHTML += '<option value="' + c.id + '">' + c.name + '</option>';
  }
}

// Vaihdetaan kirjautumisen ja rekisteröinnin välillä
function setMode(isRegister) {
  message.textContent = '';
  registerFields.hidden = !isRegister;
  document.getElementById('registerBtn').hidden = !isRegister;
  document.getElementById('loginBtn').hidden = isRegister;

  if (isRegister) {
    document.getElementById('title').textContent = 'Luo tili';
    document.getElementById('toggleLink').textContent = 'Onko sinulla tili? Kirjaudu';
    loadClasses();
  } else {
    document.getElementById('title').textContent = 'Koulu';
    document.getElementById('toggleLink').textContent = 'Ei tiliä? Luo tili';
  }
}

// Luokkavalinta näkyy vain oppilaalle
roleSelect.onchange = function () {
  classSelect.hidden = roleSelect.value === 'teacher';
};

document.getElementById('toggleLink').onclick = function (e) {
  e.preventDefault();
  // jos rekisteröinti on auki, mennään kirjautumiseen ja toisinpäin
  setMode(registerFields.hidden);
};

document.getElementById('loginBtn').onclick = login;
document.getElementById('registerBtn').onclick = register;

// Enter-näppäin
passwordInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    if (registerFields.hidden) {
      login();
    } else {
      register();
    }
  }
});