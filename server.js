const http = require('http');
const fs = require('fs');
const server = http.createServer((req, res) => {
    console.log('Alguien pidió:', req.url);

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

    if (req.method === 'POST' && req.url === '/api/prestamos') {
        let cuerpo = '';

        req.on('data', (pedazo) => {
            cuerpo += pedazo;
        });

        req.on('end', () => {
            const datosPrestamo = JSON.parse(cuerpo);

            const contenido = fs.readFileSync('db.json', 'utf-8');
            const datos = JSON.parse(contenido);

            const equipo = datos.equipos.find(e => e.id == datosPrestamo.equipoId);

            if (!equipo) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Equipo no encontrado' }));
                return;
            }

            equipo.disponible = false;

            datos.prestamos.push({
                equipoId: equipo.id,
                equipoNombre: equipo.nombre,
                persona: datosPrestamo.persona,
                fechaRetiro: new Date().toISOString()
            });

            fs.writeFileSync('db.json', JSON.stringify(datos, null, 2));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ mensaje: 'Prestamo registrado con exito' }));
        });

        return;
    }
    if (req.method === 'POST' && req.url === '/api/devoluciones') {
        let cuerpo = '';

        req.on('data', (pedazo) => {
            cuerpo += pedazo;
        });

        req.on('end', () => {
            const datosDevolucion = JSON.parse(cuerpo);

            const contenido = fs.readFileSync('db.json', 'utf-8');
            const datos = JSON.parse(contenido);

            const equipo = datos.equipos.find(e => e.id == datosDevolucion.equipoId);

            if (!equipo) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Equipo no encontrado' }));
                return;
            }

            equipo.disponible = true;

            fs.writeFileSync('db.json', JSON.stringify(datos, null, 2));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ mensaje: 'Devolucion registrada con exito' }));
        });

        return;
    }

    if (req.url === '/api/prestamos') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const contenido = fs.readFileSync('db.json', 'utf-8');
        const datos = JSON.parse(contenido);
        res.end(JSON.stringify(datos.prestamos));
    } else if (req.url === '/api/equipos') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const contenido = fs.readFileSync('db.json', 'utf-8');
        const datos = JSON.parse(contenido);
        const equipos = datos.equipos;
        res.end(JSON.stringify(equipos));
    } else if (req.url.startsWith('/api/equipos/')) {
        const partes = req.url.split('/');
        const idBuscado = partes[3];

        const contenido = fs.readFileSync('db.json', 'utf-8');
        const datos = JSON.parse(contenido);
        const equipoEncontrado = datos.equipos.find(e => e.id == idBuscado);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (equipoEncontrado) {
            res.end(JSON.stringify(equipoEncontrado));
        } else {
            res.end(JSON.stringify({ error: 'Equipo no encontrado' }));
        }
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Ruta no reconocida todavia.\n');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('Servidor corriendo en el puerto ' + PORT);
});