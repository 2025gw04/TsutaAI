/**
 * 見積もりAPIルート
 */

const express = require('express');
const router = express.Router();
const estimateController = require('../controllers/estimateController');

// パターン情報
router.get('/patterns', estimateController.getPatterns);
router.get('/patterns/:type', estimateController.getPatternInfo);

// 見積もりCRUD
router.get('/', estimateController.getEstimates);
router.post('/', estimateController.createEstimate);
router.get('/:id', estimateController.getEstimateById);
router.put('/:id', estimateController.updateEstimate);
router.delete('/:id', estimateController.deleteEstimate);

// 会話
router.get('/:id/conversations', estimateController.getConversations);
router.post('/:id/chat', estimateController.chat);
router.post('/:id/apply-changes', estimateController.applyChanges);

// パラメータ
router.get('/:id/parameters', estimateController.getParameters);
router.put('/:id/parameters', estimateController.saveParameters);

// フェーズ
router.get('/:id/phases', estimateController.getPhases);
router.post('/:id/phases', estimateController.savePhase);
router.delete('/:id/phases/:phaseId', estimateController.deletePhase);

// 結果
router.get('/:id/results', estimateController.getResults);
router.post('/:id/calculate', estimateController.calculateResult);

// WBSエクスポート
router.post('/:id/export-to-wbs', estimateController.exportToWbs);

module.exports = router;
