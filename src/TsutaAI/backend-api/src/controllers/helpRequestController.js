const helpRequestService = require('../services/helpRequestService');
const aiService = require('../services/aiService');

const notificationService = require('../services/notificationService');

async function createHelpRequest(req, res, next) {
  try {
    const payload = req.body;

    // Generate AI context if requested (and not already provided via preview)
    if (payload.generateContext && !payload.aiContextSummary) {
      const contextAI = await aiService.generateHelpRequestContextAI(payload);
      payload.aiContextSummary = contextAI.contextSummary;
      payload.problemType = contextAI.problemType;
      payload.detectedIssues = JSON.stringify(contextAI.detectedIssues || []);
    }

    // Direct assignment if provided
    if (payload.assignedTo) {
      payload.status = 'assigned';
      payload.assignedAt = new Date().toISOString();
    }

    const result = await helpRequestService.createHelpRequest(payload);

    // Notification Logic
    console.log(`通知送信チェック: assignedTo=${payload.assignedTo}, requesterId=${payload.requesterId}, requestTitle=${payload.requestTitle}`);

    if (payload.assignedTo) {
      // Notify the assigned helper
      try {
        console.log(`通知送信開始: userId=${payload.assignedTo}, requester=${req.user.username}`);
        await notificationService.send(
          payload.assignedTo,
          'help_request',
          '新しいヘルプリクエスト',
          `${req.user.username}さんからヘルプ要請がありました: ${payload.requestTitle}`,
          'help_request',
          result.id
        );
        console.log(`通知送信成功: userId=${payload.assignedTo}, requestId=${result.id}`);
      } catch (notifError) {
        console.error(`通知送信エラー: ${notifError.message}`, notifError);
        // エラーをログに記録するが、リクエスト作成は成功とする
      }
    } else if (payload.generateSuggestions) {
      // Logic for suggestions (if not directly assigned)
      const candidates = await helpRequestService.getCandidateHelpers(payload.requesterId);
      const suggestions = await aiService.suggestHelpersAI({
        requestId: result.id,
        ...payload,
        candidates
      });

      if (suggestions.suggestedHelpers) {
        await helpRequestService.createHelperSuggestions(result.id, suggestions.suggestedHelpers);
      }
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function previewHelpRequest(req, res, next) {
  try {
    const payload = req.body;

    // 1. Generate Context if needed
    // 1. Generate Context or Refine Text if needed
    if (payload.generateContext) {
      // Check if this is a refinement request (has title or description)
      if (payload.requestTitle || payload.requestDescription) {
        // Refine existing text
        const refined = await aiService.refineHelpRequestTextAI(payload);
        payload.aiContextSummary = refined.contextSummary; // Refined description
        // Ideally we should return title too, but for now client reads contextSummary
        // If we want to return title, we need to add refined details to response
        if (refined.refinedTitle) {
          // We can pass it back via contextSummary or a new field, but client expects aiContext object
          // Let's attach it to aiContext in response
          payload.refinedTitle = refined.refinedTitle;
        }
      } else {
        // Generate from scratch
        const contextAI = await aiService.generateHelpRequestContextAI(payload);
        payload.aiContextSummary = contextAI.contextSummary;
        payload.problemType = contextAI.problemType;
        payload.detectedIssues = JSON.stringify(contextAI.detectedIssues || []);
      }
    }

    // 2. Get Candidates
    // 3. Generate Suggestions via AI (only if requested)
    let suggestions = {};
    if (payload.generateSuggestions !== false) {
      const candidates = await helpRequestService.getCandidateHelpers(payload.requesterId);
      suggestions = await aiService.suggestHelpersAI({
        requestId: 0,
        ...payload,
        candidates
      });

      const scoreSummary = (suggestions?.suggestedHelpers || []).map((s, i) => ({
        index: i + 1,
        userId: s?.userId,
        totalMatchScore: s?.matchScores?.totalMatchScore ?? s?.totalMatchScore ?? s?.overallScore ?? null,
        skillMatchScore: s?.matchScores?.skillMatchScore ?? s?.skillMatchScore ?? null,
        availabilityScore: s?.matchScores?.availabilityScore ?? s?.availabilityScore ?? null,
        experienceScore: s?.matchScores?.experienceScore ?? s?.experienceScore ?? null
      }));
      console.log('preview suggestion scores:', JSON.stringify(scoreSummary));
    }

    res.json({
      success: true,
      data: {
        aiContext: {
          contextSummary: payload.aiContextSummary,
          problemType: payload.problemType,
          detectedIssues: payload.detectedIssues,
          // Extra fields for refinement
          refinedTitle: payload.refinedTitle,
          improvementPoints: payload.improvementPoints // Assuming we might add this later
        },
        suggestions: suggestions.suggestedHelpers || []
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getHelpRequestById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await helpRequestService.getHelpRequestById(Number(id));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getHelpRequests(req, res, next) {
  try {
    const filters = req.query;
    const result = await helpRequestService.getHelpRequests(filters);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function updateHelpRequest(req, res, next) {
  try {
    const { id } = req.params;
    const updates = req.body;
    const result = await helpRequestService.updateHelpRequest(Number(id), updates);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function assignHelper(req, res, next) {
  try {
    const { id } = req.params;
    const { helperId } = req.body;
    const result = await helpRequestService.assignHelpRequest(Number(id), Number(helperId));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function resolveRequest(req, res, next) {
  try {
    const { id } = req.params;
    const { resolutionNotes, effectiveness } = req.body;
    const result = await helpRequestService.resolveHelpRequest(Number(id), resolutionNotes, effectiveness);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function deleteRequest(req, res, next) {
  try {
    const { id } = req.params;
    await helpRequestService.deleteHelpRequest(Number(id));
    res.json({ success: true, message: 'Help request deleted successfully' });
  } catch (error) {
    next(error);
  }
}

async function getHelperSuggestions(req, res, next) {
  try {
    const { id } = req.params;
    const result = await helpRequestService.getHelperSuggestions(Number(id));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getStats(req, res, next) {
  try {
    const filters = req.query;
    const result = await helpRequestService.getHelpRequestStats(filters);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function getTopHelpers(req, res, next) {
  try {
    const { limit } = req.query;
    const result = await helpRequestService.getTopHelpers(Number(limit) || 10);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createHelpRequest,
  getHelpRequestById,
  getHelpRequests,
  updateHelpRequest,
  assignHelper,
  resolveRequest,
  deleteRequest,
  getHelperSuggestions,
  getStats,
  getTopHelpers,
  previewHelpRequest
};
