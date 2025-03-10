const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

// 创建Express应用
const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, '../frontend')));

// API路由
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// 主页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 启动服务器
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SPO+ 服务器运行在端口 ${PORT}`);
  console.log(`访问 http://localhost:${PORT} 开始使用`);
}); 