# API Bancaria

API REST desarrollada con **TypeScript** y **MongoDB** que gestiona clientes, cuentas bancarias, ingresos, retiradas y transferencias entre cuentas por IBAN.


## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior
- npm (incluido con Node.js)
- Una base de datos MongoDB: Atlas (nube) o una instancia local
- Git


## Instalación de dependencias

```bash
git clone <URL_DEL_REPOSITORIO>
cd <NOMBRE_DEL_PROYECTO>
npm install
```

## Configuración del .env

Copia el archivo de ejemplo y rellena tus valores:

```bash
cp .env.example .env
```

| Variable    | Descripción                          | Ejemplo                                                  |
| ----------- | ------------------------------------ | -------------------------------------------------------- |
| `PORT`      | Puerto en el que arranca el servidor | `3001`                                                   |
| `MONGO_URI` | Cadena de conexión a MongoDB         | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/` |
| `DB_NAME`   | Nombre de la base de datos           | `Vicio`                                                  |

> `.env` contiene credenciales y **no se sube a GitHub** (está en `.gitignore`). Solo se sube `.env.example`, con valores de ejemplo.
>
> Si la contraseña contiene caracteres especiales (`@ : / ? # %`), hay que codificarlos en la URL o, más fácil, usar una contraseña solo con letras y números.

## Cómo levantar MongoDB

### Opción A: MongoDB Atlas (recomendada)

1. Crea una cuenta en [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Crea un cluster gratuito (**M0 Free**).
3. En *Security → Database Access*, crea un usuario con usuario y contraseña.
4. En *Security → Network Access*, añade tu IP (o `0.0.0.0/0` solo para desarrollo).
5. En *Database → Connect → Drivers → Node.js*, copia la cadena de conexión, sustituye `<password>` por tu contraseña (sin los `<>`) y pégala en `MONGO_URI`.

La base de datos y las colecciones (`clientes`, `cuentas`, `movimientos`) se crean automáticamente al insertar el primer documento.

### Opción B: MongoDB local con Docker

```bash
docker run -d --name mongo -p 27017:27017 mongo
```

Y en `.env`:

```env
MONGO_URI=mongodb://localhost:27017/
DB_NAME=banco
```

## Cómo arrancar el servidor

Modo desarrollo (recarga automática):

```bash
npm run dev
```

Modo producción:

```bash
npm run build
npm start
```

Si todo va bien, verás en consola:

```
Conectado al Monguito
Api funcionando en el puerto 3001
```

| Comando         | Descripción                                    |
| --------------- | ---------------------------------------------- |
| `npm run dev`   | Arranca el servidor con `tsx watch`            |
| `npm run build` | Compila TypeScript a la carpeta `dist/`        |
| `npm start`     | Ejecuta la versión compilada (`dist/index.js`) |

## Cómo probar la API

### curl

Ejemplo básico:

```bash
curl http://localhost:3001/clientes

curl -X POST http://localhost:3001/clientes \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Ana García","email":"ana@correo.com","dni":"12345678Z"}'
```

> Para repetir la batería completa desde cero hay que vaciar las colecciones en Atlas (o cambiar los emails y DNI), porque email y dni son únicos y devolverían 409.

## Modelo de datos

Los importes se guardan en **céntimos** como enteros (`25000` = 250,00 €).

**clientes**

```json
{ "_id": "...", "nombre": "Ana García", "email": "ana@correo.com", "dni": "12345678Z", "creadoEn": "2026-11-05T10:00:00.000Z" }
```

**cuentas**

```json
{ "_id": "...", "iban": "ES7620770024003102575766", "clienteId": "...", "tipo": "corriente",
  "saldo": 150000, "descubiertoMax": 50000, "estado": "activa", "creadaEn": "2026-11-05T10:00:00.000Z" }
```

**movimientos**

```json
{ "_id": "...", "cuentaId": "...", "tipo": "transferencia_emitida", "importe": -25000, "saldoResultante": 125000,
  "concepto": "Alquiler", "categoria": "vivienda", "transferenciaId": "...", "fecha": "2026-11-05T10:15:00.000Z" }
```

- `importe` lleva signo: positivo si entra dinero, negativo si sale.
- `tipo` puede ser `ingreso`, `retirada`, `transferencia_emitida`, `transferencia_recibida` o `comision`.
- Los movimientos de una misma transferencia comparten `transferenciaId`.
- Los movimientos nunca se modifican ni se borran.

## Endpoints

Base URL: `http://localhost:3001`

### Clientes

| Método | Ruta            | Descripción                              |
| ------ | --------------- | ---------------------------------------- |
| POST   | `/clientes`     | Da de alta un cliente                    |
| GET    | `/clientes`     | Lista clientes (con paginación)          |
| GET    | `/clientes/:id` | Devuelve un cliente                      |
| PATCH  | `/clientes/:id` | Modifica nombre o email                  |

### Cuentas

| Método | Ruta                       | Descripción                                          |
| ------ | -------------------------- | ---------------------------------------------------- |
| POST   | `/cuentas`                 | Alta de cuenta con IBAN válido generado por el servidor |
| GET    | `/cuentas`                 | Lista cuentas con filtros y paginación               |
| GET    | `/cuentas/:id`             | Devuelve la cuenta con nombre y email del titular    |
| PATCH  | `/cuentas/:id/estado`      | Cambia el estado de la cuenta                        |
| GET    | `/cuentas/:id/movimientos` | Extracto con filtros y paginación                    |

### Operaciones

| Método | Ruta                      | Descripción                                |
| ------ | ------------------------- | ------------------------------------------ |
| POST   | `/cuentas/:id/ingresos`   | Ingresa dinero                             |
| POST   | `/cuentas/:id/retiradas`  | Retira dinero                              |
| POST   | `/transferencias`         | Transfiere dinero entre dos cuentas (IBAN) |

### Ejemplos de peticiones

```http
POST /clientes
{ "nombre": "Ana García", "email": "ana@correo.com", "dni": "12345678Z" }

POST /cuentas
{ "clienteId": "6730a1...", "tipo": "corriente" }

POST /cuentas/6730b2.../ingresos
{ "importe": 150000, "concepto": "Nómina", "categoria": "ingresos" }

POST /cuentas/6730b2.../retiradas
{ "importe": 20000, "concepto": "Cajero" }

PATCH /cuentas/6730b2.../estado
{ "estado": "bloqueada" }

POST /transferencias
{ "ibanOrigen": "ES...", "ibanDestino": "ES...", "importe": 25000, "concepto": "Alquiler", "categoria": "vivienda" }
```

### Extracto: parámetros

`GET /cuentas/:id/movimientos` admite, combinados:

| Parámetro   | Ejemplo                               | Descripción                                    |
| ----------- | ------------------------------------- | ---------------------------------------------- |
| `tipo`      | `?tipo=retirada,comision`             | Uno o varios tipos separados por comas         |
| `categoria` | `?categoria=vivienda`                 | Filtra por categoría                           |
| `desde`     | `?desde=2026-10-01`                   | Fecha inicial                                  |
| `hasta`     | `?hasta=2026-10-31`                   | Fecha final                                    |
| `orden`     | `?orden=fecha` / `?orden=-fecha`      | Ascendente / descendente (por defecto, más recientes primero) |
| `pagina`    | `?pagina=1`                           | Número de página                               |
| `limite`    | `?limite=20`                          | Elementos por página (máximo 100)              |

Respuesta paginada:

```json
{ "datos": [ ... ], "pagina": 1, "limite": 20, "totalElementos": 57, "totalPaginas": 3 }
```

## Reglas de negocio

### Clientes

- Obligatorios: `nombre`, `email`, `dni`.
- Email con formato válido, guardado en minúsculas. DNI de 8 dígitos y una letra.
- `email` y `dni` únicos (409), garantizado por índice único.
- El `dni` no se puede modificar.

### Alta de cuenta

- Body: `{ "clienteId": "...", "tipo": "corriente" | "ahorro" }`. El cliente debe existir (404).
- El servidor genera un **IBAN español de 24 caracteres** (`ES` + 2 dígitos de control + 20 dígitos) válido según **módulo 97 (ISO 13616)**. Si el IBAN colisiona con el índice único, se reintenta con otro.
- La cuenta nace con `saldo: 0` y `estado: "activa"`. `descubiertoMax` es 50000 para corriente y 0 para ahorro.
- Un cliente no puede tener más de **3 cuentas no cerradas** (409).

### Estados de cuenta

```
activa ↔ bloqueada
activa → cerrada
bloqueada → cerrada
```

- `cerrada` es irreversible y requiere saldo exactamente 0 (409).
- Una cuenta **bloqueada** admite ingresos y transferencias recibidas, pero no retiradas ni transferencias emitidas (409).
- Una cuenta **cerrada** no admite ninguna operación (409).
- Transición no permitida: 409. Estado inexistente: 400.

### Ingresos y retiradas

- `importe` entero mayor que 0 (400). `concepto` obligatorio. `categoria` opcional (por defecto `"otros"`).
- Cada operación genera un movimiento con su `saldoResultante`.
- **Retirada:** el saldo resultante no puede quedar por debajo de `-descubiertoMax` (409, indicando el disponible).
- **Límite diario:** la suma de retiradas de una cuenta en un día natural no puede superar 100000 (409).

### Transferencias

- Ambos IBAN deben ser válidos (400), existir (404) y ser distintos (400).
- Origen **activa**; destino **activa o bloqueada** (409). Al origen se le aplican las reglas de saldo, descubierto y límite diario de una retirada.
- **Comisión:** gratis entre cuentas del mismo cliente. Entre clientes distintos, 0,5 % del importe con mínimo de 100 céntimos, redondeado hacia arriba. La comisión también se descuenta del origen y cuenta para el control de saldo.
- Se generan los movimientos `transferencia_emitida`, `transferencia_recibida` y, si procede, `comision`, todos con el mismo `transferenciaId`.

## Códigos de estado

| Situación                                                                 | Código |
| ------------------------------------------------------------------------- | ------ |
| Lectura o actualización correctas                                         | 200    |
| Recurso u operación creados                                               | 201    |
| Datos inválidos, importe no entero, IBAN inválido u ObjectId mal formado  | 400    |
| Recurso no encontrado                                                     | 404    |
| Conflicto de negocio (duplicados, saldo insuficiente, límite, estado)     | 409    |
| Error inesperado                                                          | 500    |


## Estructura del proyecto

```
src/
├── config/        # Conexión a MongoDB
├── controllers/   # Lógica de cada endpoint
├── models/        # Tipos de datos
├── routes/        # Definición de rutas
├── utils/         # Funciones auxiliares (IBAN, validaciones...)
└── index.ts       # Punto de entrada
.env.example       # Variables de entorno de ejemplo
```