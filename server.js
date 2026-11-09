const http = require('http');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync('inventario.db');
db.exec('PRAGMA foreign_keys = ON');

function responderJSON(res, codigo, datos) {
    res.writeHead(codigo, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(datos));
}

function leerCuerpo(req, res, callback) {
    let cuerpo = '';
    req.on('data', (pedazo) => { cuerpo += pedazo; });
    req.on('end', () => {
        let datos;
        try {
            datos = cuerpo ? JSON.parse(cuerpo) : {};
        } catch (e) {
            responderJSON(res, 400, { error: 'Datos invalidos' });
            return;
        }
        try {
            callback(datos);
        } catch (e) {
            console.error(e);
            responderJSON(res, 500, { error: 'Error interno del servidor' });
        }
    });
}

function limpiar(valor) {
    return String(valor || '').trim();
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const rutaEquipo = req.url.match(/^\/api\/equipos\/(\d+)$/);

    if (req.method === 'GET' && req.url === '/api/equipos') {
        const filas = db.prepare('SELECT e.id, e.nombre, e.tipo, e.disponible, (SELECT p.persona FROM prestamos p WHERE p.equipo_id = e.id AND p.fecha_devolucion IS NULL ORDER BY p.id DESC LIMIT 1) AS enUsoPor FROM equipos e ORDER BY e.id').all();
        const equipos = filas.map(f => ({ id: f.id, nombre: f.nombre, tipo: f.tipo, disponible: f.disponible === 1, enUsoPor: f.enUsoPor }));
        responderJSON(res, 200, equipos);
        return;
    }

    if (req.method === 'POST' && req.url === '/api/equipos') {
        leerCuerpo(req, res, (datos) => {
            const nombre = limpiar(datos.nombre);
            const tipo = limpiar(datos.tipo);
            if (!nombre || !tipo) {
                responderJSON(res, 400, { error: 'El nombre y el tipo son obligatorios' });
                return;
            }
            db.prepare('INSERT INTO equipos (nombre, tipo, disponible) VALUES (?, ?, 1)').run(nombre, tipo);
            responderJSON(res, 200, { mensaje: 'Equipo agregado con exito' });
        });
        return;
    }

    if (req.method === 'PUT' && rutaEquipo) {
        leerCuerpo(req, res, (datos) => {
            const nombre = limpiar(datos.nombre);
            const tipo = limpiar(datos.tipo);
            if (!nombre || !tipo) {
                responderJSON(res, 400, { error: 'El nombre y el tipo son obligatorios' });
                return;
            }
            const resultado = db.prepare('UPDATE equipos SET nombre = ?, tipo = ? WHERE id = ?').run(nombre, tipo, Number(rutaEquipo[1]));
            if (resultado.changes === 0) {
                responderJSON(res, 404, { error: 'Equipo no encontrado' });
                return;
            }
            responderJSON(res, 200, { mensaje: 'Equipo actualizado con exito' });
        });
        return;
    }

    if (req.method === 'DELETE' && rutaEquipo) {
        try {
            const id = Number(rutaEquipo[1]);
            const equipo = db.prepare('SELECT id, disponible FROM equipos WHERE id = ?').get(id);
            if (!equipo) {
                responderJSON(res, 404, { error: 'Equipo no encontrado' });
                return;
            }
            if (equipo.disponible !== 1) {
                responderJSON(res, 400, { error: 'No se puede borrar: el equipo esta prestado ahora' });
                return;
            }
            const cantidad = db.prepare('SELECT COUNT(*) AS total FROM prestamos WHERE equipo_id = ?').get(id).total;
            if (cantidad > 0) {
                responderJSON(res, 409, { error: 'No se puede borrar: el equipo tiene ' + cantidad + ' prestamo(s) en el historial' });
                return;
            }
            db.prepare('DELETE FROM equipos WHERE id = ?').run(id);
            responderJSON(res, 200, { mensaje: 'Equipo borrado con exito' });
        } catch (e) {
            console.error(e);
            responderJSON(res, 500, { error: 'Error interno del servidor' });
        }
        return;
    }

    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/api/historial') {
        const q = url.searchParams;
        const condiciones = [];
        const params = [];
        if (q.get('persona')) { condiciones.push('prestamos.persona LIKE ?'); params.push('%' + q.get('persona') + '%'); }
        if (q.get('equipo')) { condiciones.push('equipos.nombre LIKE ?'); params.push('%' + q.get('equipo') + '%'); }
        if (q.get('estado') === 'uso') { condiciones.push('prestamos.fecha_devolucion IS NULL'); }
        if (q.get('estado') === 'devuelto') { condiciones.push('prestamos.fecha_devolucion IS NOT NULL'); }
        if (q.get('desde')) { condiciones.push("date(prestamos.fecha_retiro, 'localtime') >= ?"); params.push(q.get('desde')); }
        if (q.get('hasta')) { condiciones.push("date(prestamos.fecha_retiro, 'localtime') <= ?"); params.push(q.get('hasta')); }
        const donde = condiciones.length ? ' WHERE ' + condiciones.join(' AND ') : '';
        const sql = 'SELECT prestamos.id AS id, prestamos.equipo_id AS equipoId, equipos.nombre AS equipoNombre, prestamos.persona AS persona, prestamos.fecha_retiro AS fechaRetiro, prestamos.fecha_devolucion AS fechaDevolucion FROM prestamos JOIN equipos ON prestamos.equipo_id = equipos.id' + donde + ' ORDER BY prestamos.id DESC';
        try {
            const filas = db.prepare(sql).all(...params);
            responderJSON(res, 200, filas.map(f => ({ ...f })));
        } catch (e) {
            console.error(e);
            responderJSON(res, 500, { error: 'Error interno del servidor' });
        }
        return;
    }

    if (req.method === 'GET' && url.pathname === '/api/estadisticas') {
        try {
            const porEquipo = db.prepare("SELECT equipos.nombre AS nombre, COUNT(prestamos.id) AS veces, AVG(CASE WHEN prestamos.fecha_devolucion IS NOT NULL AND prestamos.fecha_devolucion <> prestamos.fecha_retiro THEN (julianday(prestamos.fecha_devolucion) - julianday(prestamos.fecha_retiro)) * 24 END) AS promedioHoras FROM equipos LEFT JOIN prestamos ON prestamos.equipo_id = equipos.id GROUP BY equipos.id ORDER BY veces DESC").all();
            const personas = db.prepare("SELECT persona, COUNT(*) AS veces FROM prestamos GROUP BY persona ORDER BY veces DESC, persona LIMIT 5").all();
            const atrasados = db.prepare("SELECT equipos.nombre AS equipo, prestamos.persona AS persona, prestamos.fecha_retiro AS fechaRetiro, CAST(julianday('now') - julianday(prestamos.fecha_retiro) AS INTEGER) AS dias FROM prestamos JOIN equipos ON prestamos.equipo_id = equipos.id WHERE prestamos.fecha_devolucion IS NULL AND julianday('now') - julianday(prestamos.fecha_retiro) > 3 ORDER BY dias DESC").all();
            responderJSON(res, 200, {
                porEquipo: porEquipo.map(f => ({ ...f })),
                personas: personas.map(f => ({ ...f })),
                atrasados: atrasados.map(f => ({ ...f }))
            });
        } catch (e) {
            console.error(e);
            responderJSON(res, 500, { error: 'Error interno del servidor' });
        }
        return;
    }

    if (req.method === 'GET' && req.url === '/api/prestamos') {
        const filas = db.prepare('SELECT prestamos.id AS id, prestamos.equipo_id AS equipoId, equipos.nombre AS equipoNombre, prestamos.persona AS persona, prestamos.fecha_retiro AS fechaRetiro, prestamos.fecha_devolucion AS fechaDevolucion FROM prestamos JOIN equipos ON prestamos.equipo_id = equipos.id ORDER BY prestamos.id ASC').all();
        responderJSON(res, 200, filas.map(f => ({ ...f })));
        return;
    }

    if (req.method === 'POST' && req.url === '/api/prestamos') {
        leerCuerpo(req, res, (datos) => {
            const persona = limpiar(datos.persona);
            if (!persona) {
                responderJSON(res, 400, { error: 'El nombre de la persona es obligatorio' });
                return;
            }
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
            db.prepare('INSERT INTO prestamos (equipo_id, persona, fecha_retiro) VALUES (?, ?, ?)').run(datos.equipoId, persona, new Date().toISOString());
            responderJSON(res, 200, { mensaje: 'Prestamo registrado con exito' });
        });
        return;
    }

    if (req.method === 'POST' && req.url === '/api/devoluciones') {
        leerCuerpo(req, res, (datos) => {
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
