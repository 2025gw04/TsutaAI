// 休暇管理APIのコントローラー
const vacationService = require('../services/vacationService');
const websocketService = require('../services/websocketService');

/** 休暇一覧を取得します */
async function listVacations(req, res, next) {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const options = {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };

    let vacations;
    if (userId) {
      vacations = await vacationService.findVacationsByUser(userId, options);
    } else {
      vacations = await vacationService.findAllVacations(options);
    }

    res.json({ success: true, data: vacations });
  } catch (error) {
    next(error);
  }
}

/** 新規休暇を登録します */
async function createVacation(req, res, next) {
  try {
    const payload = {
      user_id: req.body.userId,
      start_date: req.body.startDate,
      end_date: req.body.endDate,
      vacation_type: req.body.vacationType,
      notes: req.body.notes
    };

    const result = await vacationService.createVacation(payload);

    // WebSocketで休暇登録を通知（管理者向け）
    websocketService.broadcast({
      type: 'vacation_created',
      userId: req.body.userId,
      data: result,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** 休暇情報を更新します */
async function updateVacation(req, res, next) {
  try {
    const vacationId = Number(req.params.id);
    const payload = {
      start_date: req.body.startDate,
      end_date: req.body.endDate,
      vacation_type: req.body.vacationType,
      notes: req.body.notes
    };

    await vacationService.updateVacation(vacationId, payload);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/** 休暇情報を削除します */
async function deleteVacation(req, res, next) {
  try {
    const vacationId = Number(req.params.id);
    await vacationService.deleteVacation(vacationId);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/** 休暇影響分析を実行します */
async function analyzeImpact(req, res, next) {
  try {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDateとendDateを指定してください'
      });
    }

    const analysis = await vacationService.analyzeVacationImpact(startDate, endDate);

    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
}

/** 影響を受けるタスクを取得します */
async function getAffectedTasks(req, res, next) {
  try {
    const userId = Number(req.query.userId);
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    if (!userId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'userId, startDate, endDateを指定してください'
      });
    }

    const tasks = await vacationService.findAffectedTasks(userId, startDate, endDate);

    res.json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listVacations,
  createVacation,
  updateVacation,
  deleteVacation,
  analyzeImpact,
  getAffectedTasks
};
