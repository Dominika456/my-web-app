const fs = require('fs');
const path = require('path');

// Папка с вашими HTML-файлами
const publicDir = path.join(__dirname, 'public');

// Читаем все файлы в папке public
fs.readdir(publicDir, (err, files) => {
    if (err) {
        console.log('Ошибка при чтении папки:', err);
        return;
    }

    // Обрабатываем только HTML-файлы
    const htmlFiles = files.filter(file => file.endsWith('.html'));
    
    console.log(`Найдено HTML-файлов: ${htmlFiles.length}`);
    
    htmlFiles.forEach(file => {
        const filePath = path.join(publicDir, file);
        
        // Читаем содержимое файла
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.log(`Ошибка при чтении ${file}:`, err);
                return;
            }
            
            let newData = data;
            
            // Заменяем ссылки вида href="./название.html" → href="/название"
            newData = newData.replace(/href="\.\/(\w+)\.html"/g, 'href="/$1"');
            
            // Заменяем ссылки вида href="название.html" → href="/название"
            newData = newData.replace(/href="(\w+)\.html"/g, 'href="/$1"');
            
            // Заменяем ссылки вида href='./название.html' → href='/название'
            newData = newData.replace(/href='\.\/(\w+)\.html'/g, 'href="/$1"');
            
            // Заменяем ссылки вида href='название.html' → href='/название'
            newData = newData.replace(/href='(\w+)\.html'/g, 'href="/$1"');
            
            // Сохраняем изменения
            fs.writeFile(filePath, newData, 'utf8', (err) => {
                if (err) {
                    console.log(`Ошибка при сохранении ${file}:`, err);
                } else {
                    console.log(`✅ Исправлен: ${file}`);
                }
            });
        });
    });
    
    console.log('Обработка завершена!');
});