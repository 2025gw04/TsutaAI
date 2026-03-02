const userService = require('../services/userService');
const { hashPassword } = require('../utils/password');

async function listUsers(req, res, next) {
  try {
    const users = await userService.findAllUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
}

async function getUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const user = await userService.findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: '指定されたメンバーは存在しません。' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

async function createUser(req, res, next) {
  try {
    // パスワードのハッシュ化
    let passwordHash = req.body.password;
    if (req.body.password) {
      try {
        passwordHash = await hashPassword(req.body.password);
      } catch (e) {
        console.error('Password hash error:', e);
        // ハッシュ化失敗時は平文を使用（後方互換性のため）
      }
    }

    const payload = {
      username: req.body.username,
      email: req.body.email,
      password_hash: passwordHash,
      full_name: req.body.fullName,
      role: req.body.role || 'member'
    };
    const result = await userService.createUser(payload);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function updateUser(req, res, next) {
  try {
    const userId = Number(req.params.id);

    const updateData = {
      email: req.body.email,
      full_name: req.body.fullName,
      role: req.body.role
    };

    // パスワードが指定されている場合は更新対象に含める
    if (req.body.password) {
      try {
        updateData.password_hash = await hashPassword(req.body.password);
      } catch (e) {
        console.error('Password hash error:', e);
        updateData.password_hash = req.body.password;
      }
    }

    await userService.updateUser(userId, updateData);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function deleteUser(req, res, next) {
  try {
    const userId = Number(req.params.id);
    await userService.deleteUser(userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function listPromptCatalog(req, res, next) {
  try {
    const catalog = await userService.listPromptCatalog();
    res.json({ success: true, data: catalog });
  } catch (error) {
    next(error);
  }
}

async function addUserPrompt(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const prompt = await userService.addUserPrompt(userId, {
      promptName: req.body.promptName,
      responsibility: req.body.responsibility,
      notes: req.body.notes
    });
    res.status(201).json({ success: true, data: prompt });
  } catch (error) {
    next(error);
  }
}

async function updateUserPrompt(req, res, next) {
  try {
    const userPromptId = Number(req.params.promptId);
    const prompt = await userService.updateUserPrompt(userPromptId, {
      responsibility: req.body.responsibility,
      notes: req.body.notes
    });
    res.json({ success: true, data: prompt });
  } catch (error) {
    next(error);
  }
}

async function deleteUserPrompt(req, res, next) {
  try {
    const userPromptId = Number(req.params.promptId);
    await userService.deleteUserPrompt(userPromptId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  listPromptCatalog,
  addUserPrompt,
  updateUserPrompt,
  deleteUserPrompt
};
