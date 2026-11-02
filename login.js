import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const message = $('message');

// jos jo kirjautunut, siirrytään view sivulle
const { data: { session } } = await supabase.auth.getSession();
if (session) location.href = 'view.html';

// KIRJAUTUMINEN
async function login() {
  message.textContent = '';
  const { error } = await supabase.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('password').value
  });
  if (error) {
    message.textContent = 'Kirjautuminen epäonnistui: ' + error.message;
    return;
  }
  location.href = 'view.html';
}

// TILIN LUONTI
async function register() {
  message.className = 'error';
  message.textContent = '';

  const firstName = $('firstName').value.trim(); // value.trim = removes whitespace
  const lastName = $('lastName').value.trim();
  if (!firstName || !lastName) {
    message.textContent = 'Kirjoita etu- ja sukunimi.';
    return;
  }

  const role = $('role').value; // 'student' tai 'teacher'

  // rooli, nimi ja luokka kulkevat mukana, ja trigger luo niistä rivin
  const { data, error } = await supabase.auth.signUp({
    email: $('email').value.trim(),
    password: $('password').value,
    options: {
      data: {
        role: role,
        first_name: firstName,
        last_name: lastName,
        class_id: role === 'student' ? $('classSelect').value : ''
      }
    }
  });

  if (error) {
    message.textContent = 'Tilin luonti epäonnistui: ' + error.message;
    return;
  }

  if (data.session) {
    location.href = 'view.html';
  }
}

// TILOJEN VAIHTO
let registerMode = false;
async function loadClasses() {
  const { data, error } = await supabase.from('classes').select('id, name').order('name');
  if (error) console.error('Luokkien haku epäonnistui:', error.message);
  console.log('classes:', data);
  $('classSelect').innerHTML = (data ?? [])
    .map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

// Ottaa textboxit ja listboxit pois piilosta
function setMode(isRegister) {
  registerMode = isRegister;
  message.textContent = '';
  $('registerFields').hidden = !isRegister;
  $('registerBtn').hidden = !isRegister;
  $('loginBtn').hidden = isRegister;
  $('title').textContent = isRegister ? 'Luo tili' : 'Koulu';
  $('toggleLink').textContent = isRegister ? 'Onko sinulla tili? Kirjaudu' : 'Ei tiliä? Luo tili';
  if (isRegister) loadClasses();
}

// luokkavalinta näkyy vain oppilaalle
$('role').onchange = () => {
  $('classSelect').hidden = $('role').value === 'teacher';
};

$('toggleLink').onclick = e => { e.preventDefault(); setMode(!registerMode); };
$('loginBtn').onclick = login;
$('registerBtn').onclick = register;
$('password').addEventListener('keydown', e => {
  if (e.key === 'Enter') registerMode ? register() : login(); 
});