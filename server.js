const http = require('http');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('inventario.db');

function leerCuerpo(req, callback) {
    let cuerpo = '';
    req.on('data', (pedazo) => { cuerpo += pedazo; });
    req.on('end', () => { callback(JSON.parse(cuerpo)); });
}

function responderJSON(res, codigo, datos) {
    res.writeHead(codigo, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(datos));
}

const server = http.createServer((req, res) => {
    console.log('Alguien pidio:', req.method, req.url);

    if (req.url === '/') {
        const html = fs.readFileSync('index.html', 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/api/equipos') {
        const filas = db.prepare('SELECT e.id, e.nombre, e.tipo, e.disponible, (SELECT p.persona FROM prestamos p WHERE p.equipo_id = e.id AND p.fecha_devolucion IS NULL ORDER BY p.id DESC LIMIT 1) AS enUsoPor FROM equipos e').all();
        const equipos = filas.map(f => ({ id: f.id, nombre: f.nombre, tipo: f.tipo, disponible: f.disponible === 1, enUsoPor: f.enUsoPor }));
        responderJSON(res, 200, equipos);
        return;
    }

    if (req.method === 'GET' && req.url === '/api/prestamos') {
        const filas = db.prepare('SELECT prestamos.id AS id, prestamos.equipo_id AS equipoId, equipos.nombre AS equipoNombre, prestamos.persona AS persona, prestamos.fecha_retiro AS fechaRetiro, prestamos.fecha_devolucion AS fechaDevolucion FROM prestamos JOIN equipos ON prestamos.equipo_id = equipos.id ORDER BY prestamos.id ASC').all();
        responderJSON(res, 200, filas.map(f => ({ ...f })));
        return;
    }

    if (req.method === 'POST' && req.url === '/api/prestamos') {
        leerCuerpo(req, (datos) => {
            const equipo = db.prepare('SELECT id, disponible FROM equipos WHERE id = ?').get(datos.equipoId);
            if (!equipo) {
                responderJSON(res, 404, { error: 'Equipo no encontrado' });
                return;
            }
            if (equipo.disponible !== 1) {
                responderJSON(res, 400, { error: 'El equipo ya esta prestado' });
                return;
            }
            db.prepare('UPDATE equipos SET disponible = 0 WHERE id = ?').run(datos.equipoId);
            db.prepare('INSERT INTO prestamos (equipo_id, persona, fecha_retiro) VALUES (?, ?, ?)').run(datos.equipoId, datos.persona, new Date().toISOString());
            responderJSON(res, 200, { mensaje: 'Prestamo registrado con exito' });
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/devoluciones') {
        leerCuerpo(req, (datos) => {
            const equipo = db.prepare('SELECT id FROM equipos WHERE id = ?').get(datos.equipoId);
            if (!equipo) {
                responderJSON(res, 404, { error: 'Equipo no encontrado' });
                return;
            }
            db.prepare('UPDATE equipos SET disponible = 1 WHERE id = ?').run(datos.equipoId);
            db.prepare('UPDATE prestamos SET fecha_devolucion = ? WHERE equipo_id = ? AND fecha_devolucion IS NULL').run(new Date().toISOString(), datos.equipoId);
            responderJSON(res, 200, { mensaje: 'Devolucion registrada con exito' });
        });
        return;
    }

    responderJSON(res, 404, { error: 'Ruta no encontrada' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('Servidor corriendo en el puerto ' + PORT);
});
