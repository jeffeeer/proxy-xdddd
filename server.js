const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Base de datos SQLite
const db = new sqlite3.Database("./db.sqlite");
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, url TEXT)"
  );
});

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    store: new SQLiteStore(),
    secret: "un_secreto_muy_fuerte_123",
    resave: false,
    saveUninitialized: false,
  })
);

// Simple autenticación (usuario: admin, contraseña: password)
const USER = "admin";
const PASS = "password";

function checkAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    next();
  } else {
    res.redirect("/login");
  }
}

// Rutas

// Login
app.get("/login", (req, res) => {
  res.render("login", { error: null });
});
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === USER && password === PASS) {
    req.session.authenticated = true;
    req.session.user = USER;
    res.redirect("/");
  } else {
    res.render("login", { error: "Usuario o contraseña incorrectos" });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Página principal: proxy form y marcadores
app.get("/", checkAuth, (req, res) => {
  db.all(
    "SELECT id, url FROM bookmarks WHERE user = ?",
    [req.session.user],
    (err, rows) => {
      if (err) rows = [];
      res.render("index", { bookmarks: rows });
    }
  );
});

// Guardar marcador
app.post("/bookmarks", checkAuth, (req, res) => {
  const url = req.body.url;
  if (!url) return res.redirect("/");
  db.run(
    "INSERT INTO bookmarks (user, url) VALUES (?, ?)",
    [req.session.user, url],
    (err) => {
      res.redirect("/");
    }
  );
});

// Borrar marcador
app.post("/bookmarks/delete/:id", checkAuth, (req, res) => {
  const id = req.params.id;
  db.run(
    "DELETE FROM bookmarks WHERE id = ? AND user = ?",
    [id, req.session.user],
    (err) => {
      res.redirect("/");
    }
  );
});

// Proxy middleware
app.use(
  "/proxy",
  checkAuth,
  createProxyMiddleware({
    target: "http://example.com", // Dummy target, will be rewritten
    changeOrigin: true,
    router: (req) => {
      // La url real viene en el query ?url=
      const url = req.query.url;
      if (!url) return "http://example.com";
      return url;
    },
    pathRewrite: (path, req) => {
      // Eliminamos /proxy del path
      return "";
    },
    onProxyReq(proxyReq, req, res) {
      // Modificar headers si es necesario
    },
  })
);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Proxy app escuchando en http://localhost:${PORT}`);
});
