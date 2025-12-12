require('dotenv').config()
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
// const { connectDB } = require('./DB/db')
const routes = require('./router')
var app = express();
var cors = require('cors');
const swaggerDocs = require('./swagger/config');
const bodyParser = require("body-parser");
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(bodyParser.json())
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors());

// connect DB
// connectDB()
app.use('/api', routes)
// swagger
swaggerDocs(app)
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // Trả về JSON thay vì render HTML
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  // Log error để debug
  console.error('Error:', err);
  
  res.status(status).json({
    success: false,
    message: message,
    ...(req.app.get('env') === 'development' && { error: err.stack })
  });
});
// app.listen(PORT, () => {
//   console.log(` Server running on http://localhost:${PORT}`);
// });


module.exports = app;
