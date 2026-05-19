const express = require('express');
const path = require('path');
const pool = require('./db');
const session = require('express-session');
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Настройка сессий
app.use(session({
    secret: 'ваш_секретный_ключ_12345',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 }
}));

app.use(express.static('public'));
app.use(express.json());

// ========== API МАРШРУТЫ ==========

// Получить все товары С ПАГИНАЦИЕЙ
app.get('/api/products', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 4;
    const offset = (page - 1) * limit;
    
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]);
        const totalResult = await pool.query('SELECT COUNT(*) FROM products');
        const total = parseInt(totalResult.rows[0].count);
        
        res.json({
            products: result.rows,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении товаров' });
    }
});

// ========== ПОИСК И ФИЛЬТРАЦИЯ ==========

// Поиск товаров С ПАГИНАЦИЕЙ
app.get('/api/products/search', async (req, res) => {
    const query = req.query.q;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 4;
    const offset = (page - 1) * limit;
    
    if (!query || query.trim() === '') {
        try {
            const result = await pool.query('SELECT * FROM products ORDER BY id LIMIT $1 OFFSET $2', [limit, offset]);
            const totalResult = await pool.query('SELECT COUNT(*) FROM products');
            res.json({
                products: result.rows,
                currentPage: page,
                totalPages: Math.ceil(parseInt(totalResult.rows[0].count) / limit),
                total: parseInt(totalResult.rows[0].count)
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Ошибка при получении товаров' });
        }
        return;
    }
    
    try {
        const result = await pool.query(
            'SELECT * FROM products WHERE name ILIKE $1 OR description ILIKE $1 ORDER BY id LIMIT $2 OFFSET $3',
            [`%${query}%`, limit, offset]
        );
        const totalResult = await pool.query(
            'SELECT COUNT(*) FROM products WHERE name ILIKE $1 OR description ILIKE $1',
            [`%${query}%`]
        );
        res.json({
            products: result.rows,
            currentPage: page,
            totalPages: Math.ceil(parseInt(totalResult.rows[0].count) / limit),
            total: parseInt(totalResult.rows[0].count)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при поиске товаров' });
    }
});

// Фильтрация по цене
app.get('/api/products/filter', async (req, res) => {
    const minPrice = req.query.min;
    const maxPrice = req.query.max;
    
    try {
        let sqlQuery = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        
        if (minPrice) {
            params.push(minPrice);
            sqlQuery += ` AND price >= $${params.length}`;
        }
        
        if (maxPrice) {
            params.push(maxPrice);
            sqlQuery += ` AND price <= $${params.length}`;
        }
        
        sqlQuery += ' ORDER BY id';
        
        const result = await pool.query(sqlQuery, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при фильтрации товаров' });
    }
});

// Получить один товар по ID
app.get('/api/products/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Товар не найден' });
        } else {
            res.json(result.rows[0]);
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при получении товара' });
    }
});

// Добавить новый товар
app.post('/api/products', async (req, res) => {
    const { name, price, description, image } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO products (name, price, description, image) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, price, description, image]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при добавлении товара' });
    }
});

// Обновить товар
app.put('/api/products/:id', async (req, res) => {
    const id = req.params.id;
    const { name, price, description, image } = req.body;
    
    try {
        const result = await pool.query(
            'UPDATE products SET name = $1, price = $2, description = $3, image = $4 WHERE id = $5 RETURNING *',
            [name, price, description, image, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при обновлении товара' });
    }
});

// Удалить товар
app.delete('/api/products/:id', async (req, res) => {
    const id = req.params.id;
    
    try {
        const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        
        res.json({ message: 'Товар успешно удалён', product: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при удалении товара' });
    }
});

// ========== ЭКСПОРТ В EXCEL ==========

// Экспорт всех товаров в Excel
app.get('/api/export-excel', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id');
        const products = result.rows;
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Товары');
        
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Название', key: 'name', width: 30 },
            { header: 'Цена (₽)', key: 'price', width: 15 },
            { header: 'Описание', key: 'description', width: 50 },
            { header: 'Изображение', key: 'image', width: 20 }
        ];
        
        products.forEach(product => {
            worksheet.addRow({
                id: product.id,
                name: product.name,
                price: product.price,
                description: product.description,
                image: product.image
            });
        });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=products.xlsx');
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при экспорте товаров' });
    }
});

// Экспорт отфильтрованных товаров в Excel
app.get('/api/export-excel-filtered', async (req, res) => {
    const search = req.query.search || '';
    const minPrice = req.query.minPrice || '';
    const maxPrice = req.query.maxPrice || '';
    
    try {
        let sqlQuery = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        
        if (search) {
            params.push(`%${search}%`);
            sqlQuery += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
        }
        
        if (minPrice) {
            params.push(minPrice);
            sqlQuery += ` AND price >= $${params.length}`;
        }
        
        if (maxPrice) {
            params.push(maxPrice);
            sqlQuery += ` AND price <= $${params.length}`;
        }
        
        sqlQuery += ' ORDER BY id';
        
        const result = await pool.query(sqlQuery, params);
        const products = result.rows;
        
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Отфильтрованные товары');
        
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Название', key: 'name', width: 30 },
            { header: 'Цена (₽)', key: 'price', width: 15 },
            { header: 'Описание', key: 'description', width: 50 },
            { header: 'Изображение', key: 'image', width: 20 }
        ];
        
        products.forEach(product => {
            worksheet.addRow({
                id: product.id,
                name: product.name,
                price: product.price,
                description: product.description,
                image: product.image
            });
        });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=filtered_products.xlsx');
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при экспорте отфильтрованных товаров' });
    }
});

// ========== АВТОРИЗАЦИЯ ==========

app.post('/api/register', async (req, res) => {
    const { last_name, first_name, middle_name, email, password } = req.body;
    
    try {
        const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            'INSERT INTO users (last_name, first_name, middle_name, email, password_hash, role_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email',
            [last_name, first_name, middle_name, email, hashedPassword, 1]
        );
        
        res.status(201).json({ message: 'Регистрация успешна', user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при регистрации' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const result = await pool.query(
            `SELECT u.*, r.name as role_name 
             FROM users u 
             JOIN roles r ON u.role_id = r.id 
             WHERE u.email = $1`,
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }
        
        req.session.userId = user.id;
        req.session.userEmail = user.email;
        req.session.userName = `${user.first_name} ${user.last_name}`;
        req.session.userRole = user.role_name;
        
        res.json({
            message: 'Вход выполнен успешно',
            user: {
                id: user.id,
                email: user.email,
                name: `${user.first_name} ${user.last_name}`,
                role: user.role_name
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при входе' });
    }
});

app.get('/api/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    res.json({
        id: req.session.userId,
        email: req.session.userEmail,
        name: req.session.userName,
        role: req.session.userRole
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Ошибка при выходе' });
        }
        res.json({ message: 'Выход выполнен успешно' });
    });
});

const isAdmin = (req, res, next) => {
    if (req.session.userId && req.session.userRole === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Доступ запрещён. Требуются права администратора.' });
    }
};

app.get('/api/admin/products', isAdmin, (req, res) => {
    res.json({ message: 'Вы вошли как администратор' });
});

// ========== СТРАНИЦЫ САЙТА ==========

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/admin-products', isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-products.html'));
});

app.get('/admin-products-add', isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-products-add.html'));
});

app.get('/admin-products-edit', isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-products-edit.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/byketi', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'byketi.html'));
});

app.get('/buket_iz_pionov', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'buket_iz_pionov.html'));
});

app.get('/buket_iz_roz', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'buket_iz_roz.html'));
});

app.get('/polevie_buketi', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'polevie_buketi.html'));
});

app.get('/svadebnie_byketi', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'svadebnie_byketi.html'));
});

app.get('/kompozisii', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kompozisii.html'));
});

app.get('/svadebnie_compozisii', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'svadebnie_compozisii.html'));
});

app.get('/v_kashpo', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'v_kashpo.html'));
});

app.get('/gortenzia', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'gortenzia.html'));
});

app.get('/orxidea', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'orxidea.html'));
});

app.get('/pion', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pion.html'));
});

app.get('/provans', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'provans.html'));
});

app.get('/syxosveti', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'syxosveti.html'));
});

app.get('/vesennee_nastroenie', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'vesennee_nastroenie.html'));
});

app.get('/premium', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'premium.html'));
});

app.get('/o_nas', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'o_nas.html'));
});

app.get('/contactu', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'contactu.html'));
});

app.get('/svizatsa_s_nami', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'svizatsa_s_nami.html'));
});

app.get('/dostavka', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dostavka.html'));
});

app.get('/vozvrat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'vozvrat.html'));
});

app.get('/zakazat_tovar', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'zakazat_tovar.html'));
});

app.get('/dizain-byket', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dizain-byket.html'));
});

app.listen(port, () => {
    console.log(`Сервер запущен на http://localhost:${port}`);
});