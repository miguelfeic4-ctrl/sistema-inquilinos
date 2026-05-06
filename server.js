const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
const session = require('express-session');

const app = express();

// =====================
// 🔥 CONFIG
// =====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'secreto123',
    resave: false,
    saveUninitialized: true
}));

// =====================
// 🔥 SQL
// =====================
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

let pool;

async function connectDB() {
  try {
    pool = await sql.connect(config);
    console.log("✅ Conectado a Azure SQL");
  } catch (err) {
    console.log("❌ Error conexión:", err);
  }
}

connectDB();
// =====================
// 🧠 FUNCIONES
// =====================
function generarHabitaciones() {
    const pisos = [2, 3, 4];
    let habitaciones = [];

    pisos.forEach(p => {
        for (let i = 1; i <= 5; i++) {
            habitaciones.push({
                numero: `${p}${i.toString().padStart(2, '0')}`
            });
        }
    });

    return habitaciones;
}

function esMoroso(fechaIngreso, montoPagado, precio) {
    if (!fechaIngreso) return false;

    const hoy = new Date();
    const ingreso = new Date(fechaIngreso);

    const limite = new Date(
        hoy.getFullYear(),
        hoy.getMonth(),
        ingreso.getDate()
    );

    return hoy > limite && montoPagado < precio;
}

function auth(req, res, next) {
    if (!req.session.usuario) return res.redirect('/login');
    next();
}

// =====================
// 🔐 LOGIN
// =====================
app.get('/login', (req, res) => res.render('login'));

async function connectDB() {
  try {
    pool = await sql.connect(config);
    console.log("✅ Conectado a Azure SQL");
  } catch (err) {
    console.log("❌ Error conexión:", err);
  }
}

connectDB();
app.post('/login', async (req, res) => {
    try {
        const { usuario, password } = req.body;

        const result = await sql.query`
            SELECT * FROM Usuarios
            WHERE usuario = ${usuario} AND password = ${password}
        `;

        if (result.recordset.length > 0) {
            req.session.usuario = usuario;
            return res.redirect('/');
        }

        res.send('❌ Usuario o contraseña incorrectos');

    } catch (err) {
        console.log(err);
        res.send('Error login');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// =====================
// 🏠 HOME
// =====================
app.get('/', auth, async (req, res) => {
    try {
        const habitaciones = generarHabitaciones();

        const ocupadas = await sql.query`
            SELECT habitacion FROM Inquilinos
            WHERE habitacion IS NOT NULL AND habitacion != ''
        `;

        const ocupadasList = ocupadas.recordset.map(i => i.habitacion);

        const disponibles = habitaciones.filter(h =>
            !ocupadasList.includes(h.numero)
        );

        res.render('index', { habitaciones: disponibles });

    } catch (err) {
        console.log(err);
        res.send('Error en home');
    }
});
// =====================
// 🗑️ ELIMINAR INQUILINO
// =====================
app.get('/eliminar/:id', async (req, res) => {
    try {

        const { id } = req.params;

        await sql.query`
            DELETE FROM Inquilinos
            WHERE id = ${id}
        `;

        res.redirect('/inquilinos');

    } catch (err) {
        console.log(err);
        res.send('Error al eliminar');
    }
});
// =====================
// 📊 HABITACIONES
// =====================
app.get('/habitaciones', auth, async (req, res) => {
    try {

        const habitaciones = generarHabitaciones();

        const result = await sql.query`
            SELECT habitacion, nombreCompleto, precio
            FROM Inquilinos
            WHERE estado != 'retirado'
        `;

        const mapa = new Map();

        result.recordset.forEach(i => {
            if (!i.habitacion) return;

            mapa.set(String(i.habitacion).trim(), {
                nombre: i.nombreCompleto,
                precio: i.precio || 0
            });
        });

        const data = habitaciones.map(h => {
            const info = mapa.get(h.numero);

            return {
                numero: h.numero,
                estado: info ? 'ocupada' : 'libre',
                inquilino: info?.nombre || null,
                precio: info?.precio || 0
            };
        });

        res.render('habitaciones', {
            data,
            total: data.length,
            ocupadas: data.filter(h => h.estado === 'ocupada').length,
            libres: data.filter(h => h.estado === 'libre').length
        });

    } catch (err) {
        console.log(err);
        res.send('Error habitaciones');
    }
});

// =====================
// 💾 GUARDAR INQUILINO
// =====================
app.post('/guardar', async (req, res) => {
    try {

        const {
            codigo,
            nombreCompleto,
            dni,
            telefono,
            correo,
            estado,
            fechaIngreso,
            fechaSalida,
            tieneGarantia,
            montoGarantia,
            observaciones,
            habitacion
        } = req.body;

        await pool.request().query`
INSERT INTO Inquilinos
(
    codi,
    nombreCompleto,
    dni,
    telefono,
    correo,
    estado,
    fechaIngreso,
    fechaSalida,
    tieneGarantia,
    montoGarantia,
    observaciones,
    habitacion
)
VALUES
(
    ${codigo || ''},
    ${nombreCompleto || ''},
    ${dni || ''},
    ${telefono || ''},
    ${correo || ''},
    ${estado || 'activo'},
    ${fechaIngreso ? new Date(fechaIngreso) : null},
    ${fechaSalida ? new Date(fechaSalida) : null},
    ${Number(tieneGarantia) || 0},
    ${Number(montoGarantia) || 0},
    ${observaciones || ''},
    ${habitacion || null}
)
`;

        res.redirect('/inquilinos');

    } catch (err) {
        console.log("ERROR GUARDAR:", err);
        res.send('Error al guardar');
    }
});

// =====================
// 📋 INQUILINOS
// =====================
app.get('/inquilinos', auth, async (req, res) => {
    const result = await sql.query`SELECT * FROM Inquilinos ORDER BY nombreCompleto`;
    res.render('inquilinos', { inquilinos: result.recordset });
});

// =====================
// 💾 ACTUALIZAR PRECIO HABITACIÓN
// =====================
app.post('/habitaciones/precio', async (req, res) => {
    try {

        const { habitacion, precio } = req.body;

        await sql.query`
            UPDATE Inquilinos
            SET precio = ${Number(precio) || 0}
            WHERE habitacion = ${habitacion}
        `;

        res.redirect('/habitaciones');

    } catch (err) {
        console.log(err);
        res.send('Error al actualizar precio');
    }
});

// =====================
// 💰 Pas
// =====================
app.get('/pagos', auth, async (req, res) => {

   const mes = parseInt(req.query.mes) || new Date().getMonth() + 1;
const anio = parseInt(req.query.anio) || new Date().getFullYear();

    const inquilinos = await sql.query`
        SELECT id, nombreCompleto, habitacion, precio, fechaIngreso
        FROM Inquilinos
        WHERE estado != 'retirado'
    `;

    const Pas = await sql.query`
        SELECT * FROM Pas
        WHERE mes=${mes} AND anio=${anio}
    `;

    let total = 0;
    let pagado = 0;

    const data = inquilinos.recordset.map(i => {

        const PasDel = Pas.recordset.filter(p => p.inquilinoId === i.id);

        const monto = PasDel.reduce((s, p) => s + Number(p.monto || 0), 0);
        const precio = Number(i.precio || 0);

        total += precio;
        pagado += monto;

        let estado = 'pendiente';

        if (esMoroso(i.fechaIngreso, monto, precio)) estado = 'moroso';
        else if (monto >= precio) estado = 'pagado';
        else if (monto > 0) estado = 'parcial';

        return { ...i, precio, pago: monto, estadoPago: estado };
    });

    res.render('pagos', {
        data,
        total,
        pagado,
        pendiente: total - pagado,
        mes,
        anio
    });
});

app.get('/editar/:id', async (req, res) => {
    try {

        const { id } = req.params;

        const inquilino = await sql.query`
            SELECT * FROM Inquilinos WHERE id = ${id}
        `;

        const habitaciones = generarHabitaciones();

        res.render('editar', {
            inquilino: inquilino.recordset[0],
            habitaciones: habitaciones
        });

    } catch (err) {
        console.log("🔥 ERROR EDITAR:", err);
        res.send(err.message || 'Error al cargar edición');
    }
});

app.post('/editar/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;

        const {
            nombreCompleto,
            dni,
            telefono,
            correo,
            estado,
            habitacion
        } = req.body;

        await sql.query`
            UPDATE Inquilinos
            SET 
                nombreCompleto = ${nombreCompleto},
                dni = ${dni},
                telefono = ${telefono},
                correo = ${correo},
                estado = ${estado},
                habitacion = ${habitacion}
            WHERE id = ${id}
        `;

        res.redirect('/inquilinos');

    } catch (err) {
        console.log(err);
        res.send('Error al actualizar');
    }
});

app.post('/actualizar', async (req, res) => {
    try {

        const {
            id,
            codigo,
            nombreCompleto,
            dni,
            telefono,
            correo,
            estado,
            fechaIngreso,
            fechaSalida,
            tieneGarantia,
            montoGarantia,
            observaciones,
            habitacion
        } = req.body;

        await sql.query`
            UPDATE Inquilinos
            SET
                codi = ${codigo || ''},
                nombreCompleto = ${nombreCompleto || ''},
                dni = ${dni || ''},
                telefono = ${telefono || ''},
                correo = ${correo || ''},
                estado = ${estado || 'activo'},
                fechaIngreso = ${fechaIngreso ? new Date(fechaIngreso) : null},
                fechaSalida = ${fechaSalida ? new Date(fechaSalida) : null},
                tieneGarantia = ${Number(tieneGarantia) || 0},
                montoGarantia = ${Number(montoGarantia) || 0},
                observaciones = ${observaciones || ''},
                habitacion = ${habitacion || null}
            WHERE id = ${id}
        `;

        res.redirect('/inquilinos');

    } catch (err) {
        console.log("🔥 ERROR ACTUALIZAR:", err);
        res.send('Error al actualizar');
    }
});



// =====================
// 💾 REGISTRAR PAGO
// =====================
app.post('/pagos/registrar', async (req, res) => {
    try {

        const { inquilinoId, mes, anio, monto } = req.body;

        if (!inquilinoId || !mes || !anio || !monto) {
            return res.send('Datos incompletos');
        }

        const existe = await sql.query`
            SELECT * FROM Pas
            WHERE inquilinoId=${inquilinoId}
            AND mes=${mes}
            AND anio=${anio}
        `;

        if (existe.recordset.length > 0) {
            await sql.query`
                UPDATE Pas
                SET monto = monto + ${Number(monto)},
                    fechaPa = GETDATE()
                WHERE inquilinoId=${inquilinoId}
                AND mes=${mes}
                AND anio=${anio}
            `;
        } else {
            await sql.query`
                INSERT INTO Pas (inquilinoId, mes, anio, monto, fechaPa)
                VALUES (${inquilinoId}, ${mes}, ${anio}, ${Number(monto)}, GETDATE())
            `;
        }

        res.redirect(`/pagos?mes=${mes}&anio=${anio}`);

    } catch (err) {
        console.log(err);
        res.send(err.message);
    }
});
// =====================
// 📋 REPORTE INQUILINOS
// =====================
app.get('/reportes/inquilinos', async (req, res) => {

    const mes = Number(req.query.mes) || (new Date().getMonth() + 1);
    const anio = Number(req.query.anio) || new Date().getFullYear();

    const fechaFiltro = new Date(anio, mes - 1, 1);

    const result = await sql.query`
        SELECT * FROM Inquilinos
    `;

    const data = result.recordset.filter(i => {

    const ingreso = new Date(i.fechaIngreso);
    const salida = i.fechaSalida ? new Date(i.fechaSalida) : null;

    const fechaFiltro = new Date(anio, mes - 1, 1);

    const activoEnEseMes =
        ingreso <= fechaFiltro &&
        (!salida || salida >= fechaFiltro);

    return activoEnEseMes && i.estado !== 'retirado';
});

res.render('reporte_inquilinos', {
    data,
    mes,
    anio
});
});

app.get('/reportes', auth, (req, res) => {
    res.render('reportes');
});
// =====================
// 📊 REPORTE Pas
// =====================
app.get('/reportes/pagos', auth, async (req, res) => {
    try {

        const inquilinos = await sql.query`
            SELECT id, nombreCompleto, precio
            FROM Inquilinos
        `;

        const pagos = await sql.query`
            SELECT * FROM Pas
        `;

        let total = 0;
        let pagado = 0;

        const detalle = inquilinos.recordset.map(i => {

            const monto = pagos.recordset
                .filter(p => p.inquilinoId === i.id)
                .reduce((s, p) => s + Number(p.monto || 0), 0);

            total += Number(i.precio || 0);
            pagado += monto;

            return {
                nombre: i.nombreCompleto,
                precio: i.precio || 0,
                pago: monto,
                estado: monto >= (i.precio || 0) ? 'Pagado' : 'Pendiente'
            };
        });

    res.render('reporte_pagos', {
    total,
    pagado,
    pendiente: total - pagado,
    detalle,
    mes,
    anio
});

    } catch (err) {
        console.log('ERROR PAGOS:', err);
        res.send('Error reporte pagos');
    }
});
// =====================
// 📥 EXCEL INQUILINOS
// =====================
app.get('/reportes/inquilinos/excel', async (req, res) => {

    const mes = Number(req.query.mes);
    const anio = Number(req.query.anio);

    const fechaFiltro = new Date(anio, mes - 1, 1);

    const result = await sql.query`SELECT * FROM Inquilinos`;

    const data = result.recordset.filter(i => {
        const ingreso = new Date(i.fechaIngreso);
        const salida = i.fechaSalida ? new Date(i.fechaSalida) : null;

        return ingreso <= fechaFiltro &&
              (!salida || salida >= fechaFiltro) &&
              i.estado !== 'retirado';
    });

    // aquí generas Excel con "data"
});
app.get('/reportes/pagos/excel', auth, async (req, res) => {

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pagos');

    sheet.columns = [
        { header: 'ID Inquilino', key: 'inquilinoId', width: 15 },
        { header: 'Mes', key: 'mes', width: 10 },
        { header: 'Año', key: 'anio', width: 10 },
        { header: 'Monto', key: 'monto', width: 12 },
        { header: 'Fecha Pago', key: 'fechaPa', width: 20 }
    ];

    const result = await sql.query`
        SELECT * FROM Pas
    `;

    result.recordset.forEach(p => {
        sheet.addRow({
            ...p,
            fechaPa: p.fechaPa ? new Date(p.fechaPa) : null
        });
    });

    sheet.getColumn('fechaPa').numFmt = 'dd/mm/yyyy';

    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.setHeader(
        'Content-Disposition',
        'attachment; filename=pagos.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();
});
// =====================
// 🚀 SERVER
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('Servidor en puerto ' + PORT);
});

