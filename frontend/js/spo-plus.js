/**
 * SPO+ 核心逻辑
 * 实现提示词优化算法
 */

class SPOPlus {
    /**
     * 构造函数
     * @param {Object} config - 配置对象
     */
    constructor(config) {
        this.config = config;
        this.apiBaseUrl = config.apiBaseUrl || '/api';
        this.currentIteration = 0;
        this.maxIterations = config.maxIterations || 10;
        this.taskDescription = config.taskDescription || '';
        this.currentBestPrompt = config.initialPrompt || '';
        this.currentBestOutputs = {};
        this.samples = [];
        this.optimizationHistory = [];
        this.isAutoMode = config.isAutoMode !== undefined ? config.isAutoMode : true;
        this.onUpdateUI = config.onUpdateUI || (() => {});
        this.onFinish = config.onFinish || (() => {});
    }
    
    /**
     * 初始化SPO+系统
     * @returns {Promise<boolean>} - 初始化是否成功
     */
    async initialize() {
        try {
            // 初始化LLM服务
            const configResponse = await this.callAPI('config', {
                apiKey: this.config.apiKey,
                baseUrl: this.config.baseUrl,
                models: this.config.models
            });
            
            if (!configResponse.success) {
                throw new Error('配置API失败');
            }
            
            this.updateUI('status', '初始化成功，正在生成测试样本...');
            
            // 生成测试样本
            const samplesResponse = await this.callAPI('generate-samples', {
                taskDescription: this.taskDescription
            });
            
            if (!samplesResponse.success) {
                throw new Error('生成测试样本失败');
            }
            
            this.samples = samplesResponse.samples;
            this.updateUI('samples', this.samples);
            this.updateUI('status', '测试样本生成完成，正在执行初始提示...');
            
            // 执行初始提示
            await this.runCurrentBestPrompt();
            this.updateUI('status', '初始化完成，准备开始优化');
            
            return true;
        } catch (error) {
            console.error('初始化失败:', error);
            this.updateUI('error', `初始化失败: ${error.message}`);
            return false;
        }
    }
    
    /**
     * 执行当前最佳提示词
     * @returns {Promise<void>}
     */
    async runCurrentBestPrompt() {
        try {
            this.currentBestOutputs = {};
            
            for (const sample of this.samples) {
                const response = await this.callAPI('execute-prompt', {
                    prompt: this.currentBestPrompt,
                    question: sample.question
                });
                
                if (!response.success) {
                    throw new Error(`执行提示词失败: 样本 ${sample.id}`);
                }
                
                this.currentBestOutputs[sample.id] = response.output;
            }
            
            this.updateUI('currentOutputs', this.currentBestOutputs);
        } catch (error) {
            console.error('执行当前最佳提示词失败:', error);
            this.updateUI('error', `执行提示词失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 运行优化步骤
     * @returns {Promise<void>}
     */
    async runOptimizationStep() {
        if (this.currentIteration >= this.maxIterations) {
            this.finishOptimization();
            return;
        }
        
        try {
            this.currentIteration++;
            this.updateUI('iteration', this.currentIteration);
            this.updateUI('status', `正在执行第 ${this.currentIteration} 次优化...`);
            
            // 1. 生成新提示候选
            const optimizeResponse = await this.callAPI('optimize-prompt', {
                currentPrompt: this.currentBestPrompt,
                currentOutput: JSON.stringify(this.currentBestOutputs),
                taskDescription: this.taskDescription,
                history: this.getOptimizationHistorySummary()
            });
            
            if (!optimizeResponse.success) {
                throw new Error('优化提示词失败');
            }
            
            const newPrompt = optimizeResponse.newPrompt;
            this.updateUI('newPrompt', newPrompt);
            this.updateUI('status', '新提示候选生成完成，正在执行...');
            
            // 2. 执行新提示
            const newOutputs = {};
            for (const sample of this.samples) {
                const response = await this.callAPI('execute-prompt', {
                    prompt: newPrompt,
                    question: sample.question
                });
                
                if (!response.success) {
                    throw new Error(`执行新提示词失败: 样本 ${sample.id}`);
                }
                
                newOutputs[sample.id] = response.output;
            }
            
            this.updateUI('newOutputs', newOutputs);
            this.updateUI('status', '新提示执行完成，正在评估...');
            
            // 3. 评估新旧输出
            const evaluationResults = await this.evaluateOutputs(this.currentBestOutputs, newOutputs);
            this.updateUI('evaluations', evaluationResults);
            
            // 4. 分析提示变化
            const analysisResponse = await this.callAPI('analyze-changes', {
                oldPrompt: this.currentBestPrompt,
                newPrompt: newPrompt,
                taskDescription: this.taskDescription
            });
            
            if (!analysisResponse.success) {
                throw new Error('分析提示变化失败');
            }
            
            const analysis = analysisResponse.analysis;
            this.updateUI('analysis', analysis);
            
            // 5. 根据评估结果更新最佳提示
            const isBetter = this.shouldUpdateBestPrompt(evaluationResults);
            if (isBetter) {
                this.updateBestPrompt(newPrompt, newOutputs);
                this.updateUI('status', '发现更好的提示，已更新');
            } else {
                this.updateUI('status', '新提示未能改进，保持当前最佳提示');
            }
            
            // 记录优化历史
            this.optimizationHistory.push({
                iteration: this.currentIteration,
                prompt: newPrompt,
                isBetter: isBetter,
                analysis: analysis,
                evaluations: evaluationResults
            });
            
            this.updateUI('history', this.optimizationHistory);
            
            // 6. 如果是自动模式，继续优化；否则等待用户反馈
            if (this.isAutoMode) {
                setTimeout(() => this.runOptimizationStep(), 1000);
            } else {
                this.updateUI('status', '等待用户反馈...');
                this.updateUI('waitingForFeedback', true);
            }
        } catch (error) {
            console.error('优化步骤失败:', error);
            this.updateUI('error', `优化步骤失败: ${error.message}`);
        }
    }
    
    /**
     * 评估输出结果
     * @param {Object} currentOutputs - 当前输出
     * @param {Object} newOutputs - 新输出
     * @returns {Promise<Object>} - 评估结果
     */
    async evaluateOutputs(currentOutputs, newOutputs) {
        const evaluationResults = {};
        
        for (const sample of this.samples) {
            const sampleId = sample.id;
            const outputA = currentOutputs[sampleId];
            const outputB = newOutputs[sampleId];
            
            const response = await this.callAPI('evaluate-outputs', {
                outputA: outputA,
                outputB: outputB,
                taskDescription: this.taskDescription,
                question: sample.question
            });
            
            if (!response.success) {
                throw new Error(`评估输出失败: 样本 ${sampleId}`);
            }
            
            evaluationResults[sampleId] = response.evaluation;
        }
        
        return evaluationResults;
    }
    
    /**
     * 判断是否应该更新最佳提示
     * @param {Object} evaluationResults - 评估结果
     * @returns {boolean} - 是否应该更新
     */
    shouldUpdateBestPrompt(evaluationResults) {
        let betterCount = 0;
        let worseCount = 0;
        
        for (const sampleId in evaluationResults) {
            const result = evaluationResults[sampleId];
            if (result === 'B更好') {
                betterCount++;
            } else if (result === 'A更好') {
                worseCount++;
            }
        }
        
        // 如果有更多样本认为新提示更好，则更新
        return betterCount > worseCount;
    }
    
    /**
     * 更新最佳提示
     * @param {string} newPrompt - 新提示
     * @param {Object} newOutputs - 新输出
     */
    updateBestPrompt(newPrompt, newOutputs = null) {
        this.currentBestPrompt = newPrompt;
        this.updateUI('currentBestPrompt', newPrompt);
        
        if (newOutputs) {
            this.currentBestOutputs = newOutputs;
            this.updateUI('currentOutputs', newOutputs);
        }
    }
    
    /**
     * 获取优化历史摘要
     * @returns {string} - 历史摘要
     */
    getOptimizationHistorySummary() {
        if (this.optimizationHistory.length === 0) {
            return '';
        }
        
        // 只取最近3次迭代的历史
        const recentHistory = this.optimizationHistory.slice(-3);
        
        return recentHistory.map(item => {
            return `迭代${item.iteration}: ${item.isBetter ? '改进成功' : '未改进'}`;
        }).join('\n');
    }
    
    /**
     * 添加反馈到历史
     * @param {string} feedback - 用户反馈
     */
    addFeedbackToHistory(feedback) {
        if (this.optimizationHistory.length > 0) {
            const lastIndex = this.optimizationHistory.length - 1;
            this.optimizationHistory[lastIndex].userFeedback = feedback;
            this.updateUI('history', this.optimizationHistory);
        }
    }
    
    /**
     * 处理用户反馈
     * @param {Object} feedback - 反馈对象
     */
    handleUserFeedback(feedback) {
        if (feedback.rating === 'good' || feedback.editedPrompt) {
            // 如果用户评价为"好"或提供了编辑后的提示，更新最佳提示
            const newPrompt = feedback.editedPrompt || this.optimizationHistory[this.optimizationHistory.length - 1].prompt;
            this.updateBestPrompt(newPrompt);
        }
        
        // 添加文本反馈到历史
        if (feedback.textFeedback) {
            this.addFeedbackToHistory(feedback.textFeedback);
        }
        
        // 继续优化
        this.runOptimizationStep();
    }
    
    /**
     * 完成优化
     */
    finishOptimization() {
        const result = {
            finalPrompt: this.currentBestPrompt,
            iterations: this.currentIteration,
            history: this.optimizationHistory,
            samples: this.samples
        };
        
        this.updateUI('status', '优化完成');
        this.onFinish(result);
    }
    
    /**
     * 调用API
     * @param {string} endpoint - API端点
     * @param {Object} data - 请求数据
     * @returns {Promise<Object>} - API响应
     */
    async callAPI(endpoint, data) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP错误: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API调用失败 (${endpoint}):`, error);
            throw error;
        }
    }
    
    /**
     * 更新UI
     * @param {string} type - 更新类型
     * @param {*} data - 更新数据
     */
    updateUI(type, data) {
        this.onUpdateUI(type, data);
    }
}

// 导出SPOPlus类
window.SPOPlus = SPOPlus; 