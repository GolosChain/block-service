# Block storage service

## Запуск
```bash
sudo docker-compose up -d --build
```

## Перезапуск с обнулением
Для перезапуска с очисткой надо удалить все файлы, в добавок к "docker-compose down -v" надо удалить все файлы из примантированной как файлы MongoDB папки.
```bash
sudo docker-compose down -v
sudo rm -rf /mnt/HC_Volume_2754989/mongo-blocks-db/*
```
ну и потом снова команду из секции запуска.
