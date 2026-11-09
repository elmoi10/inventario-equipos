const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('inventario.db');

console.log('--- 1. Equipos disponibles (SELECT con WHERE) ---');
console.table(db.prepare('SELECT nombre, tipo FROM equipos WHERE disponible = 1').all());

console.log('--- 2. Historial con nombre del equipo (JOIN) ---');
console.table(db.prepare('SELECT prestamos.id, equipos.nombre AS equipo, prestamos.persona, prestamos.fecha_retiro FROM prestamos JOIN equipos ON prestamos.equipo_id = equipos.id ORDER BY prestamos.fecha_retiro DESC LIMIT 5').all());

console.log('--- 3. Cuantas veces se presto cada equipo (GROUP BY) ---');
console.table(db.prepare('SELECT equipos.nombre AS equipo, COUNT(prestamos.id) AS veces FROM equipos LEFT JOIN prestamos ON prestamos.equipo_id = equipos.id GROUP BY equipos.id ORDER BY veces DESC').all());

console.log('--- 4. Total de prestamos (COUNT) ---');
console.table(db.prepare('SELECT COUNT(*) AS total FROM prestamos').all());
