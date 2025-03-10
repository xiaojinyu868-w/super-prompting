/**
 * UI控制器
 * 处理用户界面事件和更新
 */

class UIController {
    /**
     * 构造函数
     */
    constructor() {
        this.spoPlus = null;
        this.isInitialized = false;
        this.currentView = 'config'; // config, optimization, results
        this.setupEventListeners();
    }
    
    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 配置面板事件
        document.getElementById('start-optimization').addEventListener('click', () => this.startOptimization());
        
        // 模型温度滑块事件
        const temperatureSliders = document.querySelectorAll('input[type="range"]');
        temperatureSliders.forEach(slider => {
            const valueDisplay = document.getElementById(`${slider.id}-value`);
            slider.addEventListener('input', () => {
                valueDisplay.textContent = slider.value;
            });
        });
        
        // 优化控制按钮事件
        document.getElementById('continue-optimization').addEventListener('click', () => this.continueOptimization());
        document.getElementById('finish-optimization').addEventListener('click', () => this.finishOptimization());
        
        // 反馈按钮事件
        document.querySelectorAll('.feedback-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleRatingFeedback(e.target.dataset.value);
            });
        });
        
        document.getElementById('submit-feedback').addEventListener('click', () => this.submitFeedback());
        
        // 结果视图按钮事件
        document.getElementById('copy-prompt').addEventListener('click', () => {
            const finalPrompt = document.getElementById('final-prompt').textContent;
            navigator.clipboard.writeText(finalPrompt)
                .then(() => this.showMessage('提示词已复制到剪贴板'))
                .catch(err => this.showError('复制失败: ' + err));
        });
        
        document.getElementById('export-history').addEventListener('click', () => {
            if (this.spoPlus && this.spoPlus.optimizationHistory.length > 0) {
                this.exportHistory(this.spoPlus.optimizationHistory);
            }
        });
        
        document.getElementById('new-optimization').addEventListener('click', () => {
            this.resetUI();
            this.switchView('config');
        });
        
        // 模态框关闭按钮
        document.querySelector('.close-modal').addEventListener('click', () => {
            document.getElementById('history-details-modal').style.display = 'none';
        });
        
        // 点击模态框外部关闭
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('history-details-modal');
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    /**
     * 开始优化过程
     */
    async startOptimization() {
        try {
            const config = this.getConfigFromUI();
            
            // 验证配置
            const validationResult = this.validateConfig(config);
            if (!validationResult.valid) {
                this.showError(validationResult.message);
                return;
            }
            
            this.showLoading('正在初始化...');
            
            // 创建SPO+实例
            this.spoPlus = new SPOPlus({
                ...config,
                onUpdateUI: (type, data) => this.updateUI(type, data),
                onFinish: (result) => this.handleOptimizationFinished(result)
            });
            
            // 切换到优化视图
            this.switchView('optimization');
            
            // 初始化SPO+
            const initSuccess = await this.spoPlus.initialize();
            
            if (initSuccess) {
                this.hideLoading();
                this.isInitialized = true;
                
                // 开始优化过程
                this.spoPlus.runOptimizationStep();
            } else {
                this.hideLoading();
                this.switchView('config');
            }
        } catch (error) {
            console.error('启动优化失败:', error);
            this.hideLoading();
            this.showError(`启动优化失败: ${error.message}`);
        }
    }
    
    /**
     * 从UI获取配置
     * @returns {Object} - 配置对象
     */
    getConfigFromUI() {
        return {
            apiKey: document.getElementById('api-key').value,
            baseUrl: document.getElementById('base-url').value,
            models: {
                optimizer: document.getElementById('optimizer-model').value,
                executor: document.getElementById('executor-model').value,
                evaluator: document.getElementById('evaluator-model').value,
                analyzer: document.getElementById('analyzer-model').value
            },
            temperatures: {
                optimizer: parseFloat(document.getElementById('optimizer-temp').value),
                executor: parseFloat(document.getElementById('executor-temp').value),
                evaluator: parseFloat(document.getElementById('evaluator-temp').value),
                analyzer: parseFloat(document.getElementById('analyzer-temp').value)
            },
            taskDescription: document.getElementById('task-description').value,
            initialPrompt: document.getElementById('initial-prompt').value,
            maxIterations: parseInt(document.getElementById('max-iterations').value),
            isAutoMode: document.getElementById('auto-mode').checked
        };
    }
    
    /**
     * 验证配置
     * @param {Object} config - 配置对象
     * @returns {Object} - 验证结果
     */
    validateConfig(config) {
        if (!config.apiKey) {
            return { valid: false, message: '请输入API Key' };
        }
        
        if (!config.baseUrl) {
            return { valid: false, message: '请输入API Base URL' };
        }
        
        if (!config.taskDescription) {
            return { valid: false, message: '请输入任务需求描述' };
        }
        
        if (!config.initialPrompt) {
            return { valid: false, message: '请输入初始提示词' };
        }
        
        if (config.maxIterations < 1 || config.maxIterations > 50) {
            return { valid: false, message: '迭代次数应在1-50之间' };
        }
        
        return { valid: true };
    }
    
    /**
     * 继续优化
     */
    continueOptimization() {
        if (this.isInitialized && this.spoPlus) {
            this.toggleFeedbackPanel(false);
            this.spoPlus.runOptimizationStep();
        }
    }
    
    /**
     * 完成优化
     */
    finishOptimization() {
        if (this.isInitialized && this.spoPlus) {
            this.spoPlus.finishOptimization();
        }
    }
    
    /**
     * 处理评分反馈
     * @param {string} rating - 评分值
     */
    handleRatingFeedback(rating) {
        // 高亮选中的按钮
        document.querySelectorAll('.feedback-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        document.querySelector(`.feedback-btn[data-value="${rating}"]`).classList.add('selected');
        
        // 如果评分为"好"，自动将新提示设为最佳提示
        if (rating === 'good' && this.spoPlus) {
            const newPrompt = document.getElementById('new-candidate-prompt').textContent;
            document.getElementById('prompt-edit').value = newPrompt;
        }
    }
    
    /**
     * 提交反馈
     */
    submitFeedback() {
        if (!this.isInitialized || !this.spoPlus) return;
        
        // 获取选中的评分
        const selectedBtn = document.querySelector('.feedback-btn.selected');
        const rating = selectedBtn ? selectedBtn.dataset.value : null;
        
        // 获取编辑后的提示和文本反馈
        const editedPrompt = document.getElementById('prompt-edit').value;
        const textFeedback = document.getElementById('text-feedback').value;
        
        // 提交反馈
        this.spoPlus.handleUserFeedback({
            rating,
            editedPrompt: editedPrompt.trim() !== '' ? editedPrompt : null,
            textFeedback: textFeedback.trim() !== '' ? textFeedback : null
        });
        
        // 重置反馈表单
        document.querySelectorAll('.feedback-btn').forEach(btn => btn.classList.remove('selected'));
        document.getElementById('prompt-edit').value = '';
        document.getElementById('text-feedback').value = '';
        
        // 隐藏反馈面板
        this.toggleFeedbackPanel(false);
    }
    
    /**
     * 更新UI
     * @param {string} type - 更新类型
     * @param {*} data - 更新数据
     */
    updateUI(type, data) {
        switch (type) {
            case 'status':
                document.getElementById('status-message').textContent = data;
                break;
                
            case 'error':
                this.showError(data);
                break;
                
            case 'iteration':
                document.getElementById('current-iteration').textContent = data;
                document.getElementById('max-iterations').textContent = this.spoPlus.maxIterations;
                
                // 更新进度条
                const progressPercent = (data / this.spoPlus.maxIterations) * 100;
                document.querySelector('.progress').style.width = `${progressPercent}%`;
                break;
                
            case 'samples':
                this.renderSamples(data);
                break;
                
            case 'currentBestPrompt':
                document.getElementById('current-best-prompt').textContent = data;
                break;
                
            case 'newPrompt':
                document.getElementById('new-candidate-prompt').textContent = data;
                break;
                
            case 'currentOutputs':
                this.renderOutputs('current-output', data);
                break;
                
            case 'newOutputs':
                this.renderOutputs('new-output', data);
                break;
                
            case 'evaluations':
                this.renderEvaluations(data);
                break;
                
            case 'analysis':
                document.getElementById('prompt-change-analysis').innerHTML = this.formatAnalysis(data);
                break;
                
            case 'history':
                this.renderHistory(data);
                break;
                
            case 'waitingForFeedback':
                if (data && !this.spoPlus.isAutoMode) {
                    this.toggleFeedbackPanel(true);
                }
                break;
                
            case 'finished':
                this.switchView('results');
                break;
        }
    }
    
    /**
     * 渲染样本
     * @param {Array} samples - 样本数组
     */
    renderSamples(samples) {
        const container = document.getElementById('samples-container');
        container.innerHTML = '';
        
        samples.forEach(sample => {
            const sampleElement = document.createElement('div');
            sampleElement.className = 'sample-item';
            sampleElement.innerHTML = `
                <div class="sample-header">
                    <strong>样本 ${sample.id}</strong>
                </div>
                <div class="sample-question">${sample.question}</div>
            `;
            
            container.appendChild(sampleElement);
            
            // 创建输出比较容器
            const outputComparisonContainer = document.createElement('div');
            outputComparisonContainer.className = 'output-comparison';
            outputComparisonContainer.id = `output-comparison-${sample.id}`;
            
            const outputsContainer = document.querySelector('.output-comparison');
            outputsContainer.appendChild(outputComparisonContainer);
        });
    }
    
    /**
     * 渲染输出
     * @param {string} idPrefix - ID前缀
     * @param {Object} outputs - 输出对象
     */
    renderOutputs(idPrefix, outputs) {
        for (const sampleId in outputs) {
            const output = outputs[sampleId];
            const comparisonContainer = document.getElementById(`output-comparison-${sampleId}`);
            
            // 检查是否已存在此输出卡片
            let outputCard = comparisonContainer.querySelector(`#${idPrefix}-${sampleId}`);
            
            if (!outputCard) {
                outputCard = document.createElement('div');
                outputCard.className = 'output-card';
                outputCard.id = `${idPrefix}-${sampleId}`;
                
                const title = idPrefix === 'current-output' ? '当前输出' : '新输出';
                outputCard.innerHTML = `
                    <h4>${title} (样本 ${sampleId})</h4>
                    <div id="${idPrefix}-content-${sampleId}" class="output-content"></div>
                    <div id="${idPrefix}-evaluation-${sampleId}" class="evaluation-label"></div>
                `;
                
                comparisonContainer.appendChild(outputCard);
            }
            
            // 更新输出内容
            const contentElement = document.getElementById(`${idPrefix}-content-${sampleId}`);
            contentElement.textContent = output;
        }
    }
    
    /**
     * 渲染评估结果
     * @param {Object} evaluations - 评估结果
     */
    renderEvaluations(evaluations) {
        for (const sampleId in evaluations) {
            const result = evaluations[sampleId];
            
            // 更新当前输出评估标签
            const currentEvalLabel = document.getElementById(`current-output-evaluation-${sampleId}`);
            if (currentEvalLabel) {
                currentEvalLabel.textContent = result === 'A更好' ? '更好' : (result === 'B更好' ? '更差' : '相似');
                
                // 更新样式
                const currentContent = document.getElementById(`current-output-content-${sampleId}`);
                currentContent.classList.remove('better', 'worse', 'similar');
                
                if (result === 'A更好') {
                    currentContent.classList.add('better');
                } else if (result === 'B更好') {
                    currentContent.classList.add('worse');
                } else {
                    currentContent.classList.add('similar');
                }
            }
            
            // 更新新输出评估标签
            const newEvalLabel = document.getElementById(`new-output-evaluation-${sampleId}`);
            if (newEvalLabel) {
                newEvalLabel.textContent = result === 'B更好' ? '更好' : (result === 'A更好' ? '更差' : '相似');
                
                // 更新样式
                const newContent = document.getElementById(`new-output-content-${sampleId}`);
                newContent.classList.remove('better', 'worse', 'similar');
                
                if (result === 'B更好') {
                    newContent.classList.add('better');
                } else if (result === 'A更好') {
                    newContent.classList.add('worse');
                } else {
                    newContent.classList.add('similar');
                }
            }
        }
    }
    
    /**
     * 格式化分析结果
     * @param {string} analysis - 分析结果
     * @returns {string} - 格式化后的HTML
     */
    formatAnalysis(analysis) {
        // 简单的Markdown风格转换为HTML
        return analysis
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }
    
    /**
     * 渲染优化历史
     * @param {Array} history - 历史数组
     */
    renderHistory(history) {
        const container = document.getElementById('optimization-history');
        container.innerHTML = '';
        
        history.forEach(item => {
            const historyElement = document.createElement('div');
            historyElement.className = `history-item ${item.isBetter ? 'better' : 'not-better'}`;
            
            const promptPreview = item.prompt.length > 100 
                ? item.prompt.substring(0, 100) + '...' 
                : item.prompt;
            
            historyElement.innerHTML = `
                <div class="history-header">
                    <span class="history-iteration">迭代 ${item.iteration}</span>
                    <span class="history-status">${item.isBetter ? '改进成功' : '未改进'}</span>
                </div>
                <div class="history-content">
                    <div class="history-prompt-preview">${promptPreview}</div>
                    ${item.userFeedback ? `<div class="history-feedback">用户反馈: ${item.userFeedback}</div>` : ''}
                </div>
                <button class="history-details-btn" data-iteration="${item.iteration}">查看详情</button>
            `;
            
            container.appendChild(historyElement);
            
            // 添加详情按钮点击事件
            historyElement.querySelector('.history-details-btn').addEventListener('click', () => {
                this.showHistoryDetails(item);
            });
        });
        
        // 同时更新结果视图中的历史
        if (this.currentView === 'results') {
            const resultsHistoryContainer = document.getElementById('results-history');
            resultsHistoryContainer.innerHTML = container.innerHTML;
            
            // 为结果视图中的详情按钮添加事件
            resultsHistoryContainer.querySelectorAll('.history-details-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const iteration = parseInt(btn.dataset.iteration);
                    const historyItem = history.find(item => item.iteration === iteration);
                    if (historyItem) {
                        this.showHistoryDetails(historyItem);
                    }
                });
            });
        }
    }
    
    /**
     * 显示历史详情
     * @param {Object} historyItem - 历史项
     */
    showHistoryDetails(historyItem) {
        const modal = document.getElementById('history-details-modal');
        const modalContent = modal.querySelector('.modal-content');
        
        // 构建评估结果HTML
        let evaluationsHtml = '<div class="details-section"><h4>评估结果</h4><ul>';
        for (const sampleId in historyItem.evaluations) {
            const result = historyItem.evaluations[sampleId];
            const resultClass = result === 'B更好' ? 'better' : (result === 'A更好' ? 'worse' : 'similar');
            evaluationsHtml += `<li>样本 ${sampleId}: <span class="${resultClass}">${result}</span></li>`;
        }
        evaluationsHtml += '</ul></div>';
        
        // 构建详情HTML
        modalContent.innerHTML = `
            <span class="close-modal">&times;</span>
            <h3>迭代 ${historyItem.iteration} 详情</h3>
            
            <div class="details-status ${historyItem.isBetter ? 'better' : 'not-better'}">
                ${historyItem.isBetter ? '改进成功' : '未改进'}
            </div>
            
            <div class="details-section">
                <h4>提示词</h4>
                <pre>${historyItem.prompt}</pre>
            </div>
            
            ${evaluationsHtml}
            
            <div class="details-section">
                <h4>分析</h4>
                <div>${this.formatAnalysis(historyItem.analysis)}</div>
            </div>
            
            ${historyItem.userFeedback ? `
                <div class="details-section">
                    <h4>用户反馈</h4>
                    <p>${historyItem.userFeedback}</p>
                </div>
            ` : ''}
        `;
        
        // 为关闭按钮添加事件
        modalContent.querySelector('.close-modal').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // 显示模态框
        modal.style.display = 'block';
    }
    
    /**
     * 切换反馈面板显示
     * @param {boolean} show - 是否显示
     */
    toggleFeedbackPanel(show) {
        const feedbackPanel = document.querySelector('.human-feedback');
        feedbackPanel.style.display = show ? 'block' : 'none';
        
        // 如果显示，则滚动到反馈面板
        if (show) {
            feedbackPanel.scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    /**
     * 处理优化完成
     * @param {Object} result - 优化结果
     */
    handleOptimizationFinished(result) {
        // 更新结果视图
        document.getElementById('iterations-count').textContent = result.iterations;
        document.getElementById('final-prompt').textContent = result.finalPrompt;
        
        // 渲染历史
        const resultsHistoryContainer = document.getElementById('results-history');
        resultsHistoryContainer.innerHTML = '';
        
        result.history.forEach(item => {
            const historyElement = document.createElement('div');
            historyElement.className = `history-item ${item.isBetter ? 'better' : 'not-better'}`;
            
            const promptPreview = item.prompt.length > 100 
                ? item.prompt.substring(0, 100) + '...' 
                : item.prompt;
            
            historyElement.innerHTML = `
                <div class="history-header">
                    <span class="history-iteration">迭代 ${item.iteration}</span>
                    <span class="history-status">${item.isBetter ? '改进成功' : '未改进'}</span>
                </div>
                <div class="history-content">
                    <div class="history-prompt-preview">${promptPreview}</div>
                    ${item.userFeedback ? `<div class="history-feedback">用户反馈: ${item.userFeedback}</div>` : ''}
                </div>
                <button class="history-details-btn" data-iteration="${item.iteration}">查看详情</button>
            `;
            
            resultsHistoryContainer.appendChild(historyElement);
            
            // 添加详情按钮点击事件
            historyElement.querySelector('.history-details-btn').addEventListener('click', () => {
                this.showHistoryDetails(item);
            });
        });
        
        // 切换到结果视图
        this.switchView('results');
    }
    
    /**
     * 导出历史
     * @param {Array} history - 历史数组
     */
    exportHistory(history) {
        // 构建导出数据
        const exportData = {
            date: new Date().toISOString(),
            taskDescription: this.spoPlus.taskDescription,
            initialPrompt: this.spoPlus.config.initialPrompt,
            finalPrompt: this.spoPlus.currentBestPrompt,
            iterations: this.spoPlus.currentIteration,
            history: history.map(item => ({
                iteration: item.iteration,
                prompt: item.prompt,
                isBetter: item.isBetter,
                analysis: item.analysis,
                userFeedback: item.userFeedback || null
            }))
        };
        
        // 转换为JSON字符串
        const jsonStr = JSON.stringify(exportData, null, 2);
        
        // 创建下载链接
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `spo-plus-history-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    /**
     * 切换视图
     * @param {string} view - 视图名称
     */
    switchView(view) {
        // 隐藏所有视图
        document.querySelectorAll('.view').forEach(el => {
            el.style.display = 'none';
        });
        
        // 显示指定视图
        document.getElementById(`${view}-view`).style.display = 'block';
        
        this.currentView = view;
    }
    
    /**
     * 重置UI
     */
    resetUI() {
        // 重置SPO+实例
        this.spoPlus = null;
        this.isInitialized = false;
        
        // 重置进度
        document.getElementById('current-iteration').textContent = '0';
        document.querySelector('.progress').style.width = '0%';
        
        // 重置状态消息
        document.getElementById('status-message').textContent = '准备开始优化...';
        
        // 清空提示和输出
        document.getElementById('current-best-prompt').textContent = '';
        document.getElementById('new-candidate-prompt').textContent = '';
        document.getElementById('prompt-change-analysis').innerHTML = '';
        
        // 清空样本和输出
        document.getElementById('samples-container').innerHTML = '';
        document.querySelector('.output-comparison').innerHTML = '';
        
        // 清空历史
        document.getElementById('optimization-history').innerHTML = '';
        
        // 隐藏反馈面板
        this.toggleFeedbackPanel(false);
        
        // 重置反馈表单
        document.querySelectorAll('.feedback-btn').forEach(btn => btn.classList.remove('selected'));
        document.getElementById('prompt-edit').value = '';
        document.getElementById('text-feedback').value = '';
    }
    
    /**
     * 显示加载状态
     * @param {string} message - 加载消息
     */
    showLoading(message = '加载中...') {
        const loading = document.getElementById('loading');
        const loadingMessage = loading.querySelector('.loading-message');
        
        loadingMessage.textContent = message;
        loading.style.display = 'flex';
    }
    
    /**
     * 隐藏加载状态
     */
    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }
    
    /**
     * 显示错误消息
     * @param {string} message - 错误消息
     */
    showError(message) {
        const errorElement = document.getElementById('error-message');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        // 自动隐藏
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }
    
    /**
     * 显示成功消息
     * @param {string} message - 成功消息
     */
    showMessage(message) {
        const messageElement = document.getElementById('success-message');
        messageElement.textContent = message;
        messageElement.style.display = 'block';
        
        // 自动隐藏
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 3000);
    }
}

// 初始化UI控制器
document.addEventListener('DOMContentLoaded', () => {
    window.uiController = new UIController();
}); 