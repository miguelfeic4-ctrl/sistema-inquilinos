const express = require('express');
const path = require('path');
const ExcelJS = require('exceljs');
const session = require('express-session');
const sql = require('mssql');
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
    return [
        // 1er piso
        { numero: '101' },

        // 2do piso (6 cuartos)
        { numero: '201' }, { numero: '202' }, { numero: '203' },
        { numero: '204' }, { numero: '205' }, { numero: '206' },

        // 3er piso (6 frente + 3 atrás)
        { numero: '301' }, { numero: '302' }, { numero: '303' },
        { numero: '304' }, { numero: '305' }, { numero: '306' },
        { numero: '307' }, { numero: '308' }, { numero: '309' },

        // 4to piso (8 cuartos)
        { numero: '401' }, { numero: '402' }, { numero: '403' }, { numero: '404' },
        { numero: '405' }, { numero: '406' }, { numero: '407' }, { numero: '408' }
    ];
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
app.get('/reportes/inquilinos', auth, async (req, res) => {
    try {

        const mes = Number(req.query.mes) || (new Date().getMonth() + 1);
        const anio = Number(req.query.anio) || new Date().getFullYear();

        const inicioMes = new Date(anio, mes - 1, 1);
        const finMes = new Date(anio, mes, 0, 23, 59, 59);

        const result = await sql.query`
            SELECT * FROM Inquilinos
        `;

        const data = result.recordset.filter(i => {

            const ingreso = i.fechaIngreso ? new Date(i.fechaIngreso) : null;
            const salida = i.fechaSalida ? new Date(i.fechaSalida) : null;

            if (!ingreso) return false;

            // 🔥 INTERSECCIÓN DE FECHAS (CORRECTO)
            const estuvoEnMes =
                ingreso <= finMes &&
                (!salida || salida >= inicioMes);

            return estuvoEnMes && i.estado !== 'retirado';
        });

        res.render('reporte_inquilinos', {
            data,
            mes,
            anio
        });

    } catch (err) {
        console.log(err);
        res.send('Error reporte inquilinos');
    }
});

app.get('/reportes', auth, async (req, res) => {
    const mes = Number(req.query.mes) || (new Date().getMonth() + 1);
    const anio = Number(req.query.anio) || new Date().getFullYear();

    const inquilinos = await sql.query`
        SELECT * FROM Inquilinos
    `;

    const fechaFiltro = new Date(anio, mes - 1, 1);

    const data = inquilinos.recordset.filter(i => {
        const ingreso = new Date(i.fechaIngreso);
        const salida = i.fechaSalida ? new Date(i.fechaSalida) : null;

        return ingreso <= fechaFiltro &&
              (!salida || salida >= fechaFiltro) &&
              i.estado !== 'retirado';
    });

    res.render('reportes', {
        data,
        mes,
        anio
    });
});
// =====================
// 📊 REPORTE Pas
// =====================
app.get('/reportes/pagos', auth, async (req, res) => {
    try {

        const mes = Number(req.query.mes) || (new Date().getMonth() + 1);
        const anio = Number(req.query.anio) || new Date().getFullYear();

        const inicioMes = new Date(anio, mes - 1, 1);
        const finMes = new Date(anio, mes, 0, 23, 59, 59);

        // 🔥 SOLO INQUILINOS ACTIVOS EN ESE MES
        const inquilinos = await sql.query`
            SELECT id, nombreCompleto, precio, fechaIngreso, fechaSalida
            FROM Inquilinos
            WHERE estado != 'retirado'
        `;

        const pagos = await sql.query`
            SELECT * FROM Pas
            WHERE mes = ${mes} AND anio = ${anio}
        `;

        let total = 0;
        let pagado = 0;

        const detalle = inquilinos.recordset
            .filter(i => {

                const ingreso = i.fechaIngreso ? new Date(i.fechaIngreso) : null;
                const salida = i.fechaSalida ? new Date(i.fechaSalida) : null;

                if (!ingreso) return false;

                return (
                    ingreso <= finMes &&
                    (!salida || salida >= inicioMes)
                );
            })
            .map(i => {

                const monto = pagos.recordset
                    .filter(p => p.inquilinoId === i.id)
                    .reduce((s, p) => s + Number(p.monto || 0), 0);

                const precio = Number(i.precio || 0);

                total += precio;
                pagado += monto;

                return {
                    nombre: i.nombreCompleto,
                    precio,
                    pago: monto,
                    estado: monto >= precio ? 'Pagado' : 'Pendiente'
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
        console.log("🔥 ERROR REPORTE PAGOS:", err);
        res.status(500).send("Error reporte pagos");
    }
});
// =====================
// 📥 EXCEL INQUILINOS
// =====================
app.get('/reportes/inquilinos/excel', auth, async (req, res) => {

    try {

        const mes = Number(req.query.mes) || (new Date().getMonth() + 1);
        const anio = Number(req.query.anio) || new Date().getFullYear();

        const inicioMes = new Date(anio, mes - 1, 1);
        const finMes = new Date(anio, mes, 0, 23, 59, 59);

        const result = await sql.query`SELECT * FROM Inquilinos`;

        const data = result.recordset.filter(i => {

            const ingreso = i.fechaIngreso ? new Date(i.fechaIngreso) : null;
            const salida = i.fechaSalida ? new Date(i.fechaSalida) : null;

            if (!ingreso) return false;

            return (
                ingreso <= finMes &&
                (!salida || salida >= inicioMes) &&
                i.estado !== 'retirado'
            );
        });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Inquilinos');

        sheet.columns = [
            { header: 'Nombre', key: 'nombreCompleto' },
            { header: 'DNI', key: 'dni' },
            { header: 'Teléfono', key: 'telefono' },
            { header: 'Correo', key: 'correo' },
            { header: 'Habitación', key: 'habitacion' },
            { header: 'Ingreso', key: 'fechaIngreso' },
            { header: 'Garantía', key: 'montoGarantia' },
            { header: 'Precio', key: 'precio' }
        ];

        data.forEach(i => {
            sheet.addRow({
                ...i,
                fechaIngreso: i.fechaIngreso ? new Date(i.fechaIngreso) : null
            });
        });

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        res.setHeader(
            'Content-Disposition',
            'attachment; filename=inquilinos.xlsx'
        );

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.log("🔥 ERROR EXCEL:", err);
        res.status(500).send("Error generando Excel");
    }
});
app.get('/reportes/pagos/excel', auth, async (req, res) => {

    try {

        const mes = Number(req.query.mes) || (new Date().getMonth() + 1);
        const anio = Number(req.query.anio) || (new Date().getFullYear());

        const mesActual = new Date().getMonth() + 1;
        const anioActual = new Date().getFullYear();

        const inquilinos = await sql.query`
            SELECT id, nombreCompleto, habitacion, precio, fechaIngreso, fechaSalida
            FROM Inquilinos
            WHERE estado != 'retirado'
        `;

        const pagos = await sql.query`
            SELECT * FROM Pas
            WHERE mes = ${mes} AND anio = ${anio}
        `;

        // 🔥 CASO 1: PASADO → VACÍO SI NO HAY PAGOS
        if (anio < anioActual || (anio === anioActual && mes < mesActual)) {

            if (pagos.recordset.length === 0) {
                return res.send('Excel vacío: no hay registros en este mes');
            }
        }

        // 🔥 CASO 2: FUTURO → TODOS SON DEUDORES
        const esFuturo =
            anio > anioActual ||
            (anio === anioActual && mes > mesActual);

        const data = inquilinos.recordset.map(i => {

            const precio = Number(i.precio || 0);

            const totalPagado = esFuturo
                ? 0
                : pagos.recordset
                    .filter(p => p.inquilinoId === i.id)
                    .reduce((s, p) => s + Number(p.monto || 0), 0);

            return {
                nombre: i.nombreCompleto,
                habitacion: i.habitacion,
                precio,
                pagado: totalPagado,
                estado: totalPagado >= precio ? 'Pagado' : 'No pagado'
            };
        });

        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Pagos');

        sheet.columns = [
            { header: 'Nombre', key: 'nombre' },
            { header: 'Habitación', key: 'habitacion' },
            { header: 'Precio', key: 'precio' },
            { header: 'Pagado', key: 'pagado' },
            { header: 'Estado', key: 'estado' }
        ];

        data.forEach(d => sheet.addRow(d));

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=pagos_${mes}_${anio}.xlsx`
        );

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.log("🔥 ERROR EXCEL PAGOS:", err);
        res.status(500).send("Error generando Excel pagos");
    }
});
app.post('/caja/agregar', auth, async (req, res) => {

    const { descripcion, tipo, monto } = req.body;

    await sql.query`
        INSERT INTO Caja (descripcion, tipo, monto, usuario)
        VALUES (${descripcion}, ${tipo}, ${monto}, ${req.session.usuario})
    `;

    res.redirect('/finanzas');
});

app.get('/finanzas', auth, async (req, res) => {
    try {

        const mes = Number(req.query.mes) || new Date().getMonth() + 1;
        const anio = Number(req.query.anio) || new Date().getFullYear();

        // 💰 pagos inquilinos
        const pagos = await sql.query`
            SELECT SUM(monto) as total
            FROM Pas
            WHERE mes = ${mes} AND anio = ${anio}
        `;

        // 💰 préstamos
        const prestamos = await sql.query`
            SELECT SUM(monto) as total
            FROM CajaMovimientos
            WHERE tipo = 'prestamo'
            AND mes = ${mes} AND anio = ${anio}
        `;

        // 💰 pagos de préstamos
        const pagosPrestamos = await sql.query`
            SELECT SUM(monto) as total
            FROM CajaMovimientos
            WHERE tipo = 'pago_prestamo'
            AND mes = ${mes} AND anio = ${anio}
        `;

        // ➕ ingresos extra
        const ingresosExtra = await sql.query`
            SELECT SUM(monto) as total
            FROM CajaMovimientos
            WHERE tipo='ingreso'
            AND mes = ${mes} AND anio = ${anio}
        `;

        // ➖ egresos
        const egresos = await sql.query`
            SELECT SUM(monto) as total
            FROM CajaMovimientos
            WHERE tipo='egreso'
            AND mes = ${mes} AND anio = ${anio}
        `;

        // 🧠 deuda real (inquilinos activos)
        const deuda = await sql.query`
            SELECT SUM(precio) as total
            FROM Inquilinos
            WHERE estado != 'retirado'
        `;

        // 🧾 movimientos con fecha
        const movimientos = await sql.query`
            SELECT TOP 50
                tipo,
                concepto,
                monto,
                fecha,
                usuario,
                mes,
                anio
            FROM CajaMovimientos
            ORDER BY fecha DESC
        `;

        const ingresosTotales =
            (pagos.recordset[0].total || 0) +
            (ingresosExtra.recordset[0].total || 0);

        const egresosTotales = egresos.recordset[0].total || 0;

        const cajaTotal =
            ingresosTotales -
            egresosTotales -
            (prestamos.recordset[0].total || 0) +
            (pagosPrestamos.recordset[0].total || 0);

        res.render('finanzas', {
            ingresos: ingresosTotales,
            egresos: egresosTotales,
            deuda: deuda.recordset[0].total || 0,
            cajaTotal,
            movimientos: movimientos.recordset || [],
            mes,
            anio
        });

    } catch (err) {
        console.log("❌ ERROR FINANZAS:", err);
        res.status(500).send("Error finanzas");
    }
});
app.post('/finanzas/movimiento', auth, async (req, res) => {
    try {

        const {
            tipo,
            concepto,
            monto,
            mes,
            anio
        } = req.body;

        if (!tipo || !concepto || !monto || !mes || !anio) {
            return res.send('❌ Faltan datos del movimiento');
        }

        await sql.query`
            INSERT INTO CajaMovimientos
            (tipo, concepto, monto, mes, anio, usuario)
            VALUES
            (${tipo}, ${concepto}, ${Number(monto)}, ${Number(mes)}, ${Number(anio)}, ${req.session.usuario})
        `;

        res.redirect('/finanzas?mes=' + mes + '&anio=' + anio);

    } catch (err) {
        console.log("🔥 ERROR FINANZAS MOVIMIENTO:", err);
        res.status(500).send('Error interno en finanzas');
    }
});

app.post('/finanzas/reset-caja', auth, async (req, res) => {
    try {

        // NO TOCAS BD
        // solo reinicias lógica si tienes variable o filtro

        res.redirect('/finanzas');

    } catch (err) {
        console.log('ERROR REAL:', err);
        res.send('Error al reiniciar caja');
    }
});
app.get('/deudores', auth, async (req, res) => {
    try {

        const mes = Number(req.query.mes) || new Date().getMonth() + 1;
        const anio = Number(req.query.anio) || new Date().getFullYear();

        // préstamos
        const prestamos = await sql.query`
            SELECT *
            FROM CajaMovimientos
            WHERE tipo = 'prestamo'
            AND mes = ${mes}
            AND anio = ${anio}
            ORDER BY fecha DESC
        `;

        // pagos de préstamos
        const pagos = await sql.query`
            SELECT concepto, SUM(monto) as pagado
            FROM CajaMovimientos
            WHERE tipo = 'pago_prestamo'
            AND mes = ${mes}
            AND anio = ${anio}
            GROUP BY concepto
        `;

        const mapaPagos = {};
        pagos.recordset.forEach(p => {
            mapaPagos[p.concepto] = p.pagado;
        });

        const prestamosConSaldo = prestamos.recordset.map(p => {
            const pagado = mapaPagos[p.concepto] || 0;

            return {
                ...p,
                pagado,
                saldo: p.monto - pagado
            };
        });

        const total = prestamosConSaldo.reduce((s, p) => s + p.saldo, 0);

        res.render('deudores', {
            prestamos: prestamosConSaldo,
            total,
            mes,
            anio
        });

    } catch (err) {
        console.log("ERROR DEUDORES:", err);
        res.status(500).send("Error deudores");
    }
});
app.post('/deudores/pagar', auth, async (req, res) => {
    try {

        const { concepto, monto, mes, anio, fecha } = req.body;

        const d = new Date(fecha || new Date());
        const m = d.getMonth() + 1;
        const a = d.getFullYear();

        await sql.query`
            INSERT INTO CajaMovimientos
            (tipo, concepto, monto, mes, anio, usuario, referencia)
            VALUES
            ('pago_prestamo', ${concepto}, ${Number(monto)}, ${m}, ${a}, ${req.session.usuario}, 'deudor')
        `;

        res.redirect('/deudores');

    } catch (err) {
        console.log(err);
        res.status(500).send("Error pagando deuda");
    }
});
app.post('/deudores/agregar', auth, async (req, res) => {
    try {

        const { concepto, monto, mes, anio } = req.body;

        if (!concepto || !monto || !mes || !anio) {
            return res.send("Faltan datos");
        }

        await sql.query`
            INSERT INTO CajaMovimientos
            (tipo, concepto, monto, mes, anio, usuario)
            VALUES
            ('prestamo', ${concepto}, ${Number(monto)}, ${Number(mes)}, ${Number(anio)}, ${req.session.usuario})
        `;

        res.redirect(`/deudores?mes=${mes}&anio=${anio}`);

    } catch (err) {
        console.log("ERROR PRESTAMO:", err);
        res.status(500).send("Error");
    }
});
app.get('/egresos', auth, async (req, res) => {
    try {

        const data = await sql.query`
            SELECT *
            FROM CajaMovimientos
            WHERE tipo = 'egreso'
            ORDER BY fecha DESC
        `;

        const total = await sql.query`
            SELECT SUM(monto) as total
            FROM CajaMovimientos
            WHERE tipo = 'egreso'
        `;

        res.render('egresos', {
            movimientos: data.recordset || [],
            total: total.recordset[0].total || 0
        });

    } catch (err) {
        console.log(err);
        res.status(500).send('Error egresos');
    }
});
app.post('/egresos/agregar', auth, async (req, res) => {
    try {

        const { concepto, monto, mes, anio } = req.body;

        await sql.query`
            INSERT INTO CajaMovimientos
            (tipo, concepto, monto, mes, anio, usuario)
            VALUES
            ('egreso', ${concepto}, ${monto}, ${mes}, ${anio}, ${req.session.usuario})
        `;

        res.redirect('/egresos');

    } catch (err) {
        console.log(err);
        res.status(500).send('Error egresos');
    }
});
// =====================
// 🚀 SERVER
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('Servidor en puerto ' + PORT);
});
