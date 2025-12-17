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
// Serve static uploads (images/proof)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(cors());

// connect DB
// connectDB()
app.use('/api', routes)
// swagger
swaggerDocs(app)

// Start job để tự động cancel expired transactions (chạy mỗi 1 phút)
if (process.env.NODE_ENV !== 'test') {
  const { cancelExpiredTransactions } = require('./jobs/cancelExpiredTransactions');
  console.log('[App] Đã khởi động job cancel expired transactions (chạy mỗi 1 phút)');
  // Chạy ngay lần đầu
  cancelExpiredTransactions();
  // Sau đó chạy mỗi 1 phút
  setInterval(cancelExpiredTransactions, 60 * 1000); // 60 giây = 1 phút
}

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // Log error để debug
  console.error('Error:', err);

  // Trả về JSON thay vì render view (phù hợp với API)
  res.status(err.status || 500);
  res.json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: req.app.get('env') === 'development' ? err.stack : {}
  });
});
// app.listen(PORT, () => {
//   console.log(` Server running on http://localhost:${PORT}`);
// });


module.exports = app;
