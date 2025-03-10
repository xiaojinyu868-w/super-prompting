const express = require('express');
const router = express.Router();
const LLMService = require('../llm-service');

// 初始化LLM服务
let llmService = null;

// 获取可用模型列表
router.get('/models', (req, res) => {
  try {
    // 如果LLM服务尚未初始化，创建一个临时实例
    const tempService = llmService || new LLMService('temp', process.env.DEFAULT_API_BASE_URL);
    const models = tempService.getAvailableModels();
    res.json({ success: true, models });
  } catch (error) {
    console.error('获取模型列表错误:', error);
    res.status(500).json({ error: '获取模型列表失败', details: error.message });
  }
});

// 配置API
router.post('/config', (req, res) => {
  try {
    const { apiKey, baseUrl, models } = req.body;
    
    // 验证必要参数
    if (!apiKey || !baseUrl) {
      return res.status(400).json({ error: '缺少必要参数: API Key 和 Base URL' });
    }
    
    // 初始化LLM服务
    llmService = new LLMService(apiKey, baseUrl, models);
    
    res.json({ success: true, message: 'API配置成功' });
  } catch (error) {
    console.error('API配置错误:', error);
    res.status(500).json({ error: '配置API时出错', details: error.message });
  }
});

// 生成测试样本
router.post('/generate-samples', async (req, res) => {
  try {
    if (!llmService) {
      return res.status(400).json({ error: '请先配置API' });
    }
    
    const { taskDescription } = req.body;
    
    if (!taskDescription) {
      return res.status(400).json({ error: '缺少任务描述' });
    }
    
    const samples = await llmService.generateSamples(taskDescription);
    res.json({ success: true, samples });
  } catch (error) {
    console.error('生成样本错误:', error);
    res.status(500).json({ error: '生成测试样本时出错', details: error.message });
  }
});

// 优化提示
router.post('/optimize-prompt', async (req, res) => {
  try {
    if (!llmService) {
      return res.status(400).json({ error: '请先配置API' });
    }
    
    const { currentPrompt, currentOutput, taskDescription, history } = req.body;
    
    if (!currentPrompt || !taskDescription) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    const newPrompt = await llmService.optimizePrompt(
      currentPrompt, 
      currentOutput || '', 
      taskDescription, 
      history || ''
    );
    
    res.json({ success: true, newPrompt });
  } catch (error) {
    console.error('优化提示错误:', error);
    res.status(500).json({ error: '优化提示时出错', details: error.message });
  }
});

// 执行提示
router.post('/execute-prompt', async (req, res) => {
  try {
    if (!llmService) {
      return res.status(400).json({ error: '请先配置API' });
    }
    
    const { prompt, question } = req.body;
    
    if (!prompt || !question) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    const output = await llmService.executePrompt(prompt, question);
    res.json({ success: true, output });
  } catch (error) {
    console.error('执行提示错误:', error);
    res.status(500).json({ error: '执行提示时出错', details: error.message });
  }
});

// 评估输出
router.post('/evaluate-outputs', async (req, res) => {
  try {
    if (!llmService) {
      return res.status(400).json({ error: '请先配置API' });
    }
    
    const { outputA, outputB, taskDescription, question } = req.body;
    
    if (!outputA || !outputB || !taskDescription || !question) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    const evaluation = await llmService.evaluateOutputs(
      outputA, 
      outputB, 
      taskDescription, 
      question
    );
    
    res.json({ success: true, evaluation });
  } catch (error) {
    console.error('评估输出错误:', error);
    res.status(500).json({ error: '评估输出时出错', details: error.message });
  }
});

// 分析提示变化
router.post('/analyze-changes', async (req, res) => {
  try {
    if (!llmService) {
      return res.status(400).json({ error: '请先配置API' });
    }
    
    const { oldPrompt, newPrompt, taskDescription } = req.body;
    
    if (!oldPrompt || !newPrompt || !taskDescription) {
      return res.status(400).json({ error: '缺少必要参数' });
    }
    
    const analysis = await llmService.analyzeChanges(
      oldPrompt, 
      newPrompt, 
      taskDescription
    );
    
    res.json({ success: true, analysis });
  } catch (error) {
    console.error('分析变化错误:', error);
    res.status(500).json({ error: '分析提示变化时出错', details: error.message });
  }
});

// 健康检查
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'SPO+ API服务正常运行' });
});

module.exports = router; 