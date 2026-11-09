const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const db = new DatabaseSync('inventario.db');

db.exec('DROP TABLE IF EXISTS prestamos');
db.exec('DROP TABLE IF EXISTS equipos');

db.exec('CREATE TABLE equipos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, tipo TEXT NOT NULL, disponible INTEGER NOT NULL DEFAULT 1)');
db.exec('CREATE TABLE prestamos (id INTEGER PRIMARY KEY AUTOINCREMENT, equipo_id INTEGER NOT NULL, persona TEXT NOT NULL, fecha_retiro TEXT NOT NULL, FOREIGN KEY (equipo_id) REFERENCES equipos(id))');

const datos = JSON.parse(fs.readFileSync('db.json', 'utf-8'));

const insertarEquipo = db.prepare('INSERT INTO equipos (id, nombre, tipo, disponible) VALUES (?, ?, ?, ?)');
for (const e of datos.equipos) {
  insertarEquipo.run(e.id, e.nombre, e.tipo, e.disponible ? 1 : 0);
}

const insertarPrestamo = db.prepare('INSERT INTO prestamos (equipo_id, persona, fecha_retiro) VALUES (?, ?, ?)');
for (const p of datos.prestamos) {
  insertarPrestamo.run(p.equipoId, p.persona, p.fechaRetiro);
}

console.log('Equipos:', db.prepare('SELECT * FROM equipos').all());
console.log('Prestamos:', db.prepare('SELECT * FROM prestamos').all());
