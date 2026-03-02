const db = require('../services/database');
const logger = require('../utils/logger');
const dateCalculator = require('../utils/dateCalculator');

/**
 * 祝日一覧を取得
 */
async function getAllHolidays(req, res, next) {
  try {
    const { year } = req.query;
    const knex = db.getKnex();

    let query = knex('holidays').select('*').orderBy('holiday_date');

    if (year) {
      query = query.where('holiday_date', 'like', `${year}-%`);
    }

    const holidays = await query;

    res.json({ success: true, data: holidays });
  } catch (error) {
    logger.error('Failed to get holidays:', error);
    next(error);
  }
}

/**
 * 特定の祝日を取得
 */
async function getHoliday(req, res, next) {
  try {
    const { id } = req.params;
    const knex = db.getKnex();

    const holiday = await knex('holidays').where('id', id).first();

    if (!holiday) {
      return res.status(404).json({ success: false, error: 'Holiday not found' });
    }

    res.json({ success: true, data: holiday });
  } catch (error) {
    logger.error('Failed to get holiday:', error);
    next(error);
  }
}

/**
 * 祝日を作成
 */
async function createHoliday(req, res, next) {
  try {
    const { holiday_date, holiday_name, holiday_type = 'national', is_recurring = 0, notes = '' } = req.body;

    if (!holiday_date || !holiday_name) {
      return res.status(400).json({ success: false, error: 'holiday_date and holiday_name are required' });
    }

    // 日付フォーマットの検証
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday_date)) {
      return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const knex = db.getKnex();
    const dbClient = db.getDbClient();

    let newId;
    if (dbClient === 'pg') {
      const [result] = await knex('holidays')
        .insert({ holiday_date, holiday_name, holiday_type, is_recurring, notes })
        .returning('id');
      newId = result.id;
    } else {
      const [id] = await knex('holidays')
        .insert({ holiday_date, holiday_name, holiday_type, is_recurring, notes });
      newId = id;
    }

    const newHoliday = await knex('holidays').where('id', newId).first();

    // 祝日キャッシュを無効化
    dateCalculator.invalidateHolidaysCache();

    res.status(201).json({ success: true, data: newHoliday });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed') || error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Holiday already exists for this date' });
    }
    logger.error('Failed to create holiday:', error);
    next(error);
  }
}

/**
 * 祝日を更新
 */
async function updateHoliday(req, res, next) {
  try {
    const { id } = req.params;
    const { holiday_date, holiday_name, holiday_type, is_recurring, notes } = req.body;

    const knex = db.getKnex();

    const existing = await knex('holidays').where('id', id).first();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Holiday not found' });
    }

    // 日付フォーマットの検証
    if (holiday_date && !/^\d{4}-\d{2}-\d{2}$/.test(holiday_date)) {
      return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const updateData = {};
    if (holiday_date !== undefined) updateData.holiday_date = holiday_date;
    if (holiday_name !== undefined) updateData.holiday_name = holiday_name;
    if (holiday_type !== undefined) updateData.holiday_type = holiday_type;
    if (is_recurring !== undefined) updateData.is_recurring = is_recurring;
    if (notes !== undefined) updateData.notes = notes;
    updateData.updated_at = knex.fn.now();

    await knex('holidays').where('id', id).update(updateData);

    const updated = await knex('holidays').where('id', id).first();

    // 祝日キャッシュを無効化
    dateCalculator.invalidateHolidaysCache();

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed') || error.code === '23505') {
      return res.status(400).json({ success: false, error: 'Holiday already exists for this date' });
    }
    logger.error('Failed to update holiday:', error);
    next(error);
  }
}

/**
 * 祝日を削除
 */
async function deleteHoliday(req, res, next) {
  try {
    const { id } = req.params;
    const knex = db.getKnex();

    const changes = await knex('holidays').where('id', id).del();

    if (changes === 0) {
      return res.status(404).json({ success: false, error: 'Holiday not found' });
    }

    // 祝日キャッシュを無効化
    dateCalculator.invalidateHolidaysCache();

    res.json({ success: true, message: 'Holiday deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete holiday:', error);
    next(error);
  }
}

/**
 * 複数の祝日を一括作成
 */
async function bulkCreateHolidays(req, res, next) {
  try {
    const { holidays } = req.body;

    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({ success: false, error: 'holidays array is required' });
    }

    const knex = db.getKnex();

    await knex.transaction(async (trx) => {
      for (const holiday of holidays) {
        const { holiday_date, holiday_name, holiday_type = 'national', is_recurring = 0, notes = '' } = holiday;

        if (!holiday_date || !holiday_name) {
          throw new Error('Each holiday must have holiday_date and holiday_name');
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday_date)) {
          throw new Error(`Invalid date format: ${holiday_date}`);
        }

        // INSERT OR IGNORE equivalent using onConflict
        await trx('holidays')
          .insert({ holiday_date, holiday_name, holiday_type, is_recurring, notes })
          .onConflict('holiday_date')
          .ignore();
      }
    });

    // 祝日キャッシュを無効化
    dateCalculator.invalidateHolidaysCache();

    res.json({ success: true, message: 'Holidays imported successfully' });
  } catch (error) {
    logger.error('Failed to bulk create holidays:', error);
    next(error);
  }
}

/**
 * 指定期間内の祝日を取得
 */
async function getHolidaysByRange(req, res, next) {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ success: false, error: 'start_date and end_date are required' });
    }

    const knex = db.getKnex();

    const holidays = await knex('holidays')
      .select('*')
      .whereBetween('holiday_date', [start_date, end_date])
      .orderBy('holiday_date');

    res.json({ success: true, data: holidays });
  } catch (error) {
    logger.error('Failed to get holidays by range:', error);
    next(error);
  }
}

module.exports = {
  getAllHolidays,
  getHoliday,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  bulkCreateHolidays,
  getHolidaysByRange
};
