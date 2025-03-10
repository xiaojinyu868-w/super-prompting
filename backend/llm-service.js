const axios = require('axios');

/**
 * LLM服务 - 与硅基流动API集成
 */
class LLMService {
  /**
   * 构造函数
   * @param {string} apiKey - API密钥
   * @param {string} baseUrl - API基础URL
   * @param {Object} defaultModels - 默认使用的模型配置
   */
  constructor(apiKey, baseUrl, defaultModels = null) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.defaultModels = defaultModels || {
      optimizer: process.env.DEFAULT_OPTIMIZER_MODEL || "Qwen/QwQ-32B",
      executor: process.env.DEFAULT_EXECUTOR_MODEL || "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
      evaluator: process.env.DEFAULT_EVALUATOR_MODEL || "Pro/deepseek-ai/DeepSeek-V3",
      analyzer: process.env.DEFAULT_ANALYZER_MODEL || "Pro/deepseek-ai/DeepSeek-R1"
    };
    
    this.headers = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
    
    this.enableStreaming = process.env.ENABLE_STREAMING === 'true';
  }
  
  /**
   * 调用模型
   * @param {string} prompt - 提示词
   * @param {string} modelType - 模型类型 (optimizer, executor, evaluator, analyzer)
   * @param {number} temperature - 温度参数
   * @param {boolean} stream - 是否使用流式输出
   * @returns {Promise<string>} - 模型响应
   */
  async callModel(prompt, modelType, temperature = 0.7, stream = false) {
    try {
      const model = this.defaultModels[modelType];
      
      if (!model) {
        throw new Error(`未知的模型类型: ${modelType}`);
      }
      
      const payload = {
        model: model,
        messages: [{ role: "user", content: prompt }],
        temperature: temperature,
        stream: stream && this.enableStreaming,
        max_tokens: 2048,
        top_p: 0.7,
        top_k: 50,
        frequency_penalty: 0.5,
        n: 1,
        response_format: { type: "text" }
      };
      
      if (stream && this.enableStreaming) {
        return this.streamResponse(payload);
      } else {
        const response = await axios.post(
          `${this.baseUrl}/v1/chat/completions`,
          payload,
          { headers: this.headers }
        );
        
        if (response.status === 200 && response.data.choices && response.data.choices.length > 0) {
          return response.data.choices[0].message.content;
        } else {
          throw new Error(`API响应异常: ${JSON.stringify(response.data)}`);
        }
      }
    } catch (error) {
      console.error('调用模型失败:', error);
      throw error;
    }
  }
  
  /**
   * 流式响应处理
   * @param {Object} payload - 请求负载
   * @returns {Promise<string>} - 完整响应
   */
  async streamResponse(payload) {
    return new Promise((resolve, reject) => {
      let fullResponse = '';
      
      const config = {
        method: 'post',
        url: `${this.baseUrl}/v1/chat/completions`,
        headers: {
          ...this.headers,
          'Accept': 'text/event-stream'
        },
        data: payload,
        responseType: 'stream'
      };
      
      axios(config)
        .then(response => {
          response.data.on('data', (chunk) => {
            try {
              const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
              
              for (const line of lines) {
                if (line.includes('[DONE]')) continue;
                if (!line.startsWith('data:')) continue;
                
                const jsonData = line.replace(/^data: /, '');
                if (jsonData === '[DONE]') continue;
                
                try {
                  const parsedData = JSON.parse(jsonData);
                  if (parsedData.choices && parsedData.choices[0].delta && parsedData.choices[0].delta.content) {
                    fullResponse += parsedData.choices[0].delta.content;
                  }
                } catch (e) {
                  console.warn('解析流数据失败:', e);
                }
              }
            } catch (error) {
              console.error('处理流数据失败:', error);
            }
          });
          
          response.data.on('end', () => {
            resolve(fullResponse);
          });
          
          response.data.on('error', (error) => {
            reject(error);
          });
        })
        .catch(error => {
          reject(error);
        });
    });
  }
  
  /**
   * 优化提示词
   * @param {string} currentPrompt - 当前提示词
   * @param {string} currentOutput - 当前输出
   * @param {string} taskDescription - 任务描述
   * @param {string} history - 优化历史
   * @returns {Promise<string>} - 优化后的提示词
   */
  async optimizePrompt(currentPrompt, currentOutput, taskDescription, history = "") {
    const promptTemplate = `你是一个专业的提示词优化专家。请分析以下当前提示及其生成的输出，并创建一个改进版提示。
    
    任务需求: ${taskDescription}
    
    当前提示: ${currentPrompt}
    
    当前输出: ${currentOutput}
    
    历史改进: ${history}
    
    请提供一个改进后的提示词，使其能产生更好的输出。注重以下方面:
    1. 提升输出质量和任务相关性
    2. 明确指令和约束条件
    3. 结构优化和清晰表达
    
    仅返回改进后的完整提示词，不需要解释。`;
    
    return this.callModel(promptTemplate, "optimizer", 0.7, true);
  }
  
  /**
   * 执行提示词
   * @param {string} prompt - 提示词
   * @param {string} question - 问题/测试样本
   * @returns {Promise<string>} - 执行结果
   */
  async executePrompt(prompt, question) {
    const fullPrompt = `${prompt}\n\n${question}`;
    return this.callModel(fullPrompt, "executor", 0.7, true);
  }
  
  /**
   * 评估输出
   * @param {string} outputA - 输出A
   * @param {string} outputB - 输出B
   * @param {string} taskDescription - 任务描述
   * @param {string} question - 问题/测试样本
   * @returns {Promise<string>} - 评估结果
   */
  async evaluateOutputs(outputA, outputB, taskDescription, question) {
    const promptTemplate = `你是一个公正的评估专家。请比较以下两个输出，确定哪个更符合任务需求。
    
    任务需求: ${taskDescription}
    
    问题: ${question}
    
    输出A: ${outputA}
    
    输出B: ${outputB}
    
    请根据相关性、准确性、完整性、清晰度等方面进行评估。
    只返回一个选项: "A更好", "B更好", 或 "相似"。不需要解释。`;
    
    return this.callModel(promptTemplate, "evaluator", 0.3, false);
  }
  
  /**
   * 分析提示词变化
   * @param {string} oldPrompt - 旧提示词
   * @param {string} newPrompt - 新提示词
   * @param {string} taskDescription - 任务描述
   * @returns {Promise<string>} - 分析结果
   */
  async analyzeChanges(oldPrompt, newPrompt, taskDescription) {
    const promptTemplate = `你是一个提示词分析专家。请分析新提示相比旧提示的改进之处，并解释这些变化的目的和预期效果。
    
    任务需求: ${taskDescription}
    
    旧提示: ${oldPrompt}
    
    新提示: ${newPrompt}
    
    请提供详细分析，包括:
    1. 主要变化点列表
    2. 每处变化的目的和预期效果
    3. 这些改进如何更好地满足任务需求
    4. 潜在的优缺点
    
    返回一个结构化的分析报告。`;
    
    return this.callModel(promptTemplate, "analyzer", 0.5, true);
  }
  
  /**
   * 生成测试样本
   * @param {string} taskDescription - 任务描述
   * @returns {Promise<Array>} - 测试样本数组
   */
  async generateSamples(taskDescription) {
    const promptTemplate = `请根据以下任务需求，生成3个多样化且具有代表性的测试问题/场景。
    
    任务需求: ${taskDescription}
    
    这些测试样本将用于评估提示词的效果。请确保:
    1. 样本多样化，涵盖不同难度和场景
    2. 样本能够测试提示词的关键功能
    3. 样本真实且实用
    
    请直接返回JSON格式的样本数组，不要使用markdown格式或代码块，每个样本包含id和question字段:
    [
      {"id": 1, "question": "样本问题1"},
      {"id": 2, "question": "样本问题2"},
      {"id": 3, "question": "样本问题3"}
    ]`;
    
    const response = await this.callModel(promptTemplate, "optimizer", 0.7, false);
    
    try {
      // 尝试清理响应中可能存在的Markdown格式
      let cleanedResponse = response;
      
      // 移除可能的Markdown代码块标记
      if (cleanedResponse.includes("```")) {
        // 提取代码块内容
        const codeBlockMatch = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
          cleanedResponse = codeBlockMatch[1].trim();
        } else {
          // 如果没有匹配到完整代码块，则移除所有```标记
          cleanedResponse = cleanedResponse.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
        }
      }
      
      // 尝试解析JSON
      try {
        return JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('第一次解析样本JSON失败:', parseError);
        
        // 尝试修复常见的JSON格式问题
        // 1. 移除可能的注释
        cleanedResponse = cleanedResponse.replace(/\/\/.*$/gm, "");
        // 2. 确保属性名有引号
        cleanedResponse = cleanedResponse.replace(/(\s*)(\w+)(\s*):/g, '$1"$2"$3:');
        
        try {
          return JSON.parse(cleanedResponse);
        } catch (secondParseError) {
          console.error('第二次解析样本JSON失败:', secondParseError);
          
          // 如果仍然失败，尝试手动构建样本
          // 查找所有可能的问题文本
          const questionMatches = cleanedResponse.match(/"question"\s*:\s*"([^"]+)"/g);
          if (questionMatches && questionMatches.length > 0) {
            const samples = [];
            questionMatches.forEach((match, index) => {
              const question = match.match(/"question"\s*:\s*"([^"]+)"/)[1];
              samples.push({ id: index + 1, question });
            });
            
            if (samples.length > 0) {
              return samples;
            }
          }
          
          // 最后的后备方案：将整个响应分成三部分作为样本
          const lines = response.split('\n').filter(line => line.trim() !== '');
          if (lines.length >= 3) {
            return [
              { id: 1, question: lines[0] },
              { id: 2, question: lines[1] },
              { id: 3, question: lines[2] }
            ];
          } else {
            // 如果所有尝试都失败，返回一个包含原始响应的单样本
            return [{ id: 1, question: response }];
          }
        }
      }
    } catch (error) {
      console.error('解析样本JSON失败:', error);
      // 如果解析失败，返回一个包含原始响应的单样本
      return [{ id: 1, question: response }];
    }
  }
  
  /**
   * 获取可用模型列表
   * @returns {Array} - 可用模型列表
   */
  getAvailableModels() {
    return [
      "Qwen/QwQ-32B", 
      "Pro/deepseek-ai/DeepSeek-R1", 
      "Pro/deepseek-ai/DeepSeek-V3", 
      "deepseek-ai/DeepSeek-R1", 
      "deepseek-ai/DeepSeek-V3", 
      "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B"
    ];
  }
}

module.exports = LLMService; 