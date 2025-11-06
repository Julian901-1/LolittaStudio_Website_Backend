const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = '8467897419:AAH9SGbqVEd-V_JU7KGR6optfz13OjFszIk';
const OWNER_CHAT_ID = '487525838';

class TelegramNotifier {
  constructor(db) {
    this.bot = new TelegramBot(BOT_TOKEN, { polling: true });
    this.db = db;
    this.initializeBot();
  }

  initializeBot() {
    // Обработчик команды /start
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      const username = msg.from.username || msg.from.first_name || 'Пользователь';

      // Сохраняем пользователя в базу данных
      const users = this.db.get('telegramUsers').value() || [];
      const userExists = users.find(u => u.chatId === chatId);

      if (!userExists) {
        this.db.get('telegramUsers')
          .push({
            chatId: chatId,
            username: username,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name,
            addedAt: new Date().toISOString()
          })
          .write();

        console.log(`[Telegram] Новый пользователь добавлен: ${username} (${chatId})`);
      }

      // Отправляем приветственное сообщение
      this.bot.sendMessage(chatId,
        `Привет, ${username}! 👋\n\n` +
        `Вы подписались на уведомления о новых заявках с сайта LolittaStudio.\n\n` +
        `Теперь вы будете получать информацию о каждой новой заявке.`
      );
    });

    // Обработчик команды /stop
    this.bot.onText(/\/stop/, (msg) => {
      const chatId = msg.chat.id;

      // Удаляем пользователя из базы данных
      this.db.get('telegramUsers')
        .remove({ chatId: chatId })
        .write();

      this.bot.sendMessage(chatId,
        `Вы отписались от уведомлений. 😔\n\n` +
        `Чтобы снова подписаться, отправьте /start`
      );

      console.log(`[Telegram] Пользователь удален: ${chatId}`);
    });

    // Обработчик команды /stats
    this.bot.onText(/\/stats/, (msg) => {
      const chatId = msg.chat.id;
      const submissions = this.db.get('submissions').value() || [];
      const users = this.db.get('telegramUsers').value() || [];

      const today = new Date().toISOString().split('T')[0];
      const todaySubmissions = submissions.filter(s =>
        s.timestamp && s.timestamp.startsWith(today)
      ).length;

      this.bot.sendMessage(chatId,
        `📊 Статистика:\n\n` +
        `Всего заявок: ${submissions.length}\n` +
        `Заявок сегодня: ${todaySubmissions}\n` +
        `Подписчиков: ${users.length}`
      );
    });

    console.log('[Telegram] Бот запущен и ожидает сообщений');
  }

  // Форматирование сообщения о заявке
  formatSubmissionMessage(submission) {
    const timestamp = new Date(submission.timestamp).toLocaleString('ru-RU');

    // Определяем тип заявки
    const isFullForm = submission.complexity && submission.window_size;

    let message = `🆕 НОВАЯ ЗАЯВКА\n\n`;
    message += `⏰ Время: ${timestamp}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (isFullForm) {
      // Полная форма
      message += `📋 ТИП: Полная заявка\n\n`;

      // Сложность работы
      const complexityLabels = {
        'low': 'Низкая сложность (контур без заливок)',
        'medium': 'Средняя сложность (с заливкой, одна сторона)',
        'high': 'Высокая сложность (с заливкой, обе стороны)'
      };
      message += `🎨 Сложность: ${complexityLabels[submission.complexity] || submission.complexity}\n\n`;

      // Размер окна
      const sizeLabels = {
        'small': 'До 2 кв.м',
        'medium': '2-5 кв.м',
        'large': '5-10 кв.м',
        'xlarge': 'Более 10 кв.м'
      };
      message += `📐 Размер окна: ${sizeLabels[submission.window_size] || submission.window_size}\n\n`;

      // Местоположение
      const locationLabels = {
        'moscow': 'Москва',
        'mo': 'Московская область'
      };
      message += `📍 Местоположение: ${locationLabels[submission.location] || submission.location}\n\n`;

      // Дизайн
      const designLabels = {
        'yes': 'Есть готовый эскиз',
        'idea': 'Есть идея, нужна помощь',
        'no': 'Нужна разработка с нуля'
      };
      message += `🎨 Дизайн: ${designLabels[submission.design] || submission.design}\n\n`;

      // Сроки
      const timingLabels = {
        'urgent': 'Как можно скорее',
        'week': 'В течение недели',
        'month': 'В течение месяца',
        'flexible': 'Сроки гибкие'
      };
      message += `⏳ Сроки: ${timingLabels[submission.timing] || submission.timing}\n\n`;

      message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    } else {
      // Короткая форма
      message += `📋 ТИП: Быстрая заявка\n\n`;
      message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    // Контактные данные (всегда есть)
    message += `👤 ИМЯ: ${submission.name || 'Не указано'}\n`;
    message += `📱 ТЕЛЕФОН: ${submission.phone || 'Не указан'}\n`;

    if (submission.comment) {
      message += `\n💬 Комментарий: ${submission.comment}\n`;
    }

    return message;
  }

  // Отправка уведомления о новой заявке
  async notifyNewSubmission(submission) {
    try {
      const message = this.formatSubmissionMessage(submission);

      // Получаем всех подписчиков
      const users = this.db.get('telegramUsers').value() || [];

      // Отправляем владельцу (всегда)
      await this.bot.sendMessage(OWNER_CHAT_ID, message);
      console.log(`[Telegram] Сообщение отправлено владельцу (${OWNER_CHAT_ID})`);

      // Отправляем всем подписчикам
      for (const user of users) {
        try {
          // Не дублируем для владельца, если он уже в списке
          if (user.chatId.toString() !== OWNER_CHAT_ID) {
            await this.bot.sendMessage(user.chatId, message);
            console.log(`[Telegram] Сообщение отправлено пользователю ${user.username} (${user.chatId})`);
          }
        } catch (error) {
          console.error(`[Telegram] Ошибка отправки пользователю ${user.chatId}:`, error.message);

          // Если пользователь заблокировал бота, удаляем его из базы
          if (error.response && error.response.statusCode === 403) {
            this.db.get('telegramUsers')
              .remove({ chatId: user.chatId })
              .write();
            console.log(`[Telegram] Пользователь ${user.chatId} удален (заблокировал бота)`);
          }
        }
      }

      return true;
    } catch (error) {
      console.error('[Telegram] Ошибка при отправке уведомлений:', error);
      return false;
    }
  }

  // Получение информации о боте
  async getBotInfo() {
    try {
      const me = await this.bot.getMe();
      console.log('[Telegram] Информация о боте:', me);
      return me;
    } catch (error) {
      console.error('[Telegram] Ошибка получения информации о боте:', error);
      return null;
    }
  }
}

module.exports = TelegramNotifier;
