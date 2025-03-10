import streamlit as st
import requests
import json
import time
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 配置
API_BASE_URL = os.getenv("DEFAULT_API_BASE_URL", "https://api.siliconflow.cn")
DEFAULT_PORT = os.getenv("PORT", "3000")
BACKEND_URL = f"http://localhost:{DEFAULT_PORT}/api"

# 页面配置
st.set_page_config(
    page_title="SPO+ 增强型自监督提示优化系统",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 自定义CSS
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        margin-bottom: 1rem;
    }
    .sub-header {
        font-size: 1.5rem;
        margin-bottom: 1rem;
    }
    .output-container {
        background-color: #f0f2f6;
        border-radius: 0.5rem;
        padding: 1rem;
        margin-bottom: 1rem;
    }
    .better {
        border-left: 4px solid #28a745;
    }
    .worse {
        border-left: 4px solid #dc3545;
    }
    .similar {
        border-left: 4px solid #ffc107;
    }
    .history-item {
        padding: 0.5rem;
        margin-bottom: 0.5rem;
        border-radius: 0.3rem;
        background-color: #f8f9fa;
    }
    .history-item.better {
        border-left: 4px solid #28a745;
    }
    .history-item.not-better {
        border-left: 4px solid #dc3545;
    }
</style>
""", unsafe_allow_html=True)

# 初始化会话状态
if 'initialized' not in st.session_state:
    st.session_state.initialized = False
    st.session_state.api_configured = False
    st.session_state.current_view = "config"
    st.session_state.current_iteration = 0
    st.session_state.max_iterations = 10
    st.session_state.samples = []
    st.session_state.current_best_prompt = ""
    st.session_state.current_best_outputs = {}
    st.session_state.new_prompt = ""
    st.session_state.new_outputs = {}
    st.session_state.evaluations = {}
    st.session_state.analysis = ""
    st.session_state.optimization_history = []
    st.session_state.is_optimizing = False
    st.session_state.available_models = []

# 获取可用模型列表
def get_available_models():
    try:
        response = requests.get(f"{BACKEND_URL}/models")
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                return data.get('models', [])
        return []
    except Exception as e:
        st.error(f"获取模型列表失败: {str(e)}")
        return []

# 调用API
def call_api(endpoint, data=None):
    try:
        if data:
            response = requests.post(f"{BACKEND_URL}/{endpoint}", json=data)
        else:
            response = requests.get(f"{BACKEND_URL}/{endpoint}")
        
        if response.status_code == 200:
            return response.json()
        else:
            error_data = response.json()
            st.error(f"API错误: {error_data.get('error', '未知错误')}")
            return None
    except Exception as e:
        st.error(f"API调用失败: {str(e)}")
        return None

# 配置API
def configure_api(api_key, base_url, models):
    data = {
        "apiKey": api_key,
        "baseUrl": base_url,
        "models": models
    }
    
    response = call_api("config", data)
    if response and response.get('success'):
        st.session_state.api_configured = True
        return True
    return False

# 生成测试样本
def generate_samples(task_description):
    data = {
        "taskDescription": task_description
    }
    
    response = call_api("generate-samples", data)
    if response and response.get('success'):
        return response.get('samples', [])
    return []

# 执行提示词
def execute_prompt(prompt, question):
    data = {
        "prompt": prompt,
        "question": question
    }
    
    response = call_api("execute-prompt", data)
    if response and response.get('success'):
        return response.get('output', "")
    return ""

# 优化提示词
def optimize_prompt(current_prompt, current_output, task_description, history=""):
    data = {
        "currentPrompt": current_prompt,
        "currentOutput": current_output,
        "taskDescription": task_description,
        "history": history
    }
    
    response = call_api("optimize-prompt", data)
    if response and response.get('success'):
        return response.get('newPrompt', "")
    return ""

# 评估输出
def evaluate_outputs(output_a, output_b, task_description, question):
    data = {
        "outputA": output_a,
        "outputB": output_b,
        "taskDescription": task_description,
        "question": question
    }
    
    response = call_api("evaluate-outputs", data)
    if response and response.get('success'):
        return response.get('evaluation', "相似")
    return "相似"

# 分析提示变化
def analyze_changes(old_prompt, new_prompt, task_description):
    data = {
        "oldPrompt": old_prompt,
        "newPrompt": new_prompt,
        "taskDescription": task_description
    }
    
    response = call_api("analyze-changes", data)
    if response and response.get('success'):
        return response.get('analysis', "")
    return ""

# 执行当前最佳提示词
def run_current_best_prompt():
    outputs = {}
    
    with st.spinner("正在执行当前提示词..."):
        for sample in st.session_state.samples:
            output = execute_prompt(st.session_state.current_best_prompt, sample['question'])
            outputs[sample['id']] = output
    
    st.session_state.current_best_outputs = outputs
    return outputs

# 获取优化历史摘要
def get_optimization_history_summary():
    if not st.session_state.optimization_history:
        return ""
    
    # 只取最近3次迭代的历史
    recent_history = st.session_state.optimization_history[-3:]
    
    return "\n".join([
        f"迭代{item['iteration']}: {'改进成功' if item['is_better'] else '未改进'}"
        for item in recent_history
    ])

# 判断是否应该更新最佳提示
def should_update_best_prompt(evaluations):
    better_count = 0
    worse_count = 0
    
    for sample_id, result in evaluations.items():
        if result == "B更好":
            better_count += 1
        elif result == "A更好":
            worse_count += 1
    
    # 如果有更多样本认为新提示更好，则更新
    return better_count > worse_count

# 运行优化步骤
def run_optimization_step():
    if st.session_state.current_iteration >= st.session_state.max_iterations:
        st.session_state.is_optimizing = False
        st.session_state.current_view = "results"
        return
    
    st.session_state.current_iteration += 1
    
    # 1. 生成新提示候选
    with st.spinner(f"正在执行第 {st.session_state.current_iteration} 次优化..."):
        new_prompt = optimize_prompt(
            st.session_state.current_best_prompt,
            json.dumps(st.session_state.current_best_outputs),
            st.session_state.task_description,
            get_optimization_history_summary()
        )
        
        if not new_prompt:
            st.error("优化提示词失败")
            st.session_state.is_optimizing = False
            return
        
        st.session_state.new_prompt = new_prompt
        
        # 2. 执行新提示
        new_outputs = {}
        for sample in st.session_state.samples:
            output = execute_prompt(new_prompt, sample['question'])
            new_outputs[sample['id']] = output
        
        st.session_state.new_outputs = new_outputs
        
        # 3. 评估新旧输出
        evaluations = {}
        for sample in st.session_state.samples:
            sample_id = sample['id']
            output_a = st.session_state.current_best_outputs.get(sample_id, "")
            output_b = new_outputs.get(sample_id, "")
            
            evaluation = evaluate_outputs(
                output_a,
                output_b,
                st.session_state.task_description,
                sample['question']
            )
            
            evaluations[sample_id] = evaluation
        
        st.session_state.evaluations = evaluations
        
        # 4. 分析提示变化
        analysis = analyze_changes(
            st.session_state.current_best_prompt,
            new_prompt,
            st.session_state.task_description
        )
        
        st.session_state.analysis = analysis
        
        # 5. 根据评估结果更新最佳提示
        is_better = should_update_best_prompt(evaluations)
        if is_better:
            st.session_state.current_best_prompt = new_prompt
            st.session_state.current_best_outputs = new_outputs
        
        # 记录优化历史
        st.session_state.optimization_history.append({
            "iteration": st.session_state.current_iteration,
            "prompt": new_prompt,
            "is_better": is_better,
            "analysis": analysis,
            "evaluations": evaluations
        })
    
    # 如果是自动模式，继续优化
    if st.session_state.auto_mode:
        time.sleep(1)  # 短暂延迟，让UI更新
        run_optimization_step()

# 配置视图
def show_config_view():
    st.markdown("<h1 class='main-header'>SPO+ 增强型自监督提示优化系统</h1>", unsafe_allow_html=True)
    
    # 获取可用模型列表
    if not st.session_state.available_models:
        st.session_state.available_models = get_available_models()
    
    with st.form("config_form"):
        st.markdown("<h2 class='sub-header'>API设置</h2>", unsafe_allow_html=True)
        
        api_key = st.text_input("API Key", type="password")
        base_url = st.text_input("Base URL", value=API_BASE_URL)
        
        st.markdown("<h2 class='sub-header'>模型设置</h2>", unsafe_allow_html=True)
        
        col1, col2 = st.columns(2)
        
        with col1:
            optimizer_model = st.selectbox(
                "优化模型 (LLM-1)",
                options=st.session_state.available_models,
                index=0 if st.session_state.available_models else None
            )
            
            evaluator_model = st.selectbox(
                "评估模型 (LLM-3)",
                options=st.session_state.available_models,
                index=2 if len(st.session_state.available_models) > 2 else 0
            )
        
        with col2:
            executor_model = st.selectbox(
                "执行模型 (LLM-2)",
                options=st.session_state.available_models,
                index=5 if len(st.session_state.available_models) > 5 else 0
            )
            
            analyzer_model = st.selectbox(
                "分析模型 (LLM-4)",
                options=st.session_state.available_models,
                index=1 if len(st.session_state.available_models) > 1 else 0
            )
        
        st.markdown("<h2 class='sub-header'>任务设置</h2>", unsafe_allow_html=True)
        
        task_description = st.text_area("任务需求描述", height=100)
        initial_prompt = st.text_area("初始提示词", height=150)
        
        col1, col2 = st.columns(2)
        
        with col1:
            max_iterations = st.number_input("最大迭代次数", min_value=1, max_value=20, value=10)
        
        with col2:
            auto_mode = st.checkbox("自动模式 (无需人工干预)", value=True)
        
        submitted = st.form_submit_button("开始优化")
        
        if submitted:
            if not api_key:
                st.error("请输入API Key")
                return
            
            if not task_description:
                st.error("请输入任务需求描述")
                return
            
            if not initial_prompt:
                st.error("请输入初始提示词")
                return
            
            # 配置模型
            models = {
                "optimizer": optimizer_model,
                "executor": executor_model,
                "evaluator": evaluator_model,
                "analyzer": analyzer_model
            }
            
            # 保存配置到会话状态
            st.session_state.task_description = task_description
            st.session_state.current_best_prompt = initial_prompt
            st.session_state.max_iterations = max_iterations
            st.session_state.auto_mode = auto_mode
            
            # 配置API
            with st.spinner("正在配置API..."):
                if configure_api(api_key, base_url, models):
                    st.success("API配置成功")
                    
                    # 生成测试样本
                    with st.spinner("正在生成测试样本..."):
                        samples = generate_samples(task_description)
                        
                        if samples:
                            st.session_state.samples = samples
                            
                            # 执行初始提示
                            outputs = run_current_best_prompt()
                            
                            if outputs:
                                st.session_state.initialized = True
                                st.session_state.current_view = "optimization"
                                st.session_state.is_optimizing = True
                                st.rerun()
                        else:
                            st.error("生成测试样本失败")
                else:
                    st.error("API配置失败")

# 优化视图
def show_optimization_view():
    st.markdown("<h1 class='main-header'>SPO+ 优化过程</h1>", unsafe_allow_html=True)
    
    # 状态栏
    col1, col2, col3 = st.columns([2, 6, 2])
    
    with col1:
        st.markdown(f"**迭代进度:** {st.session_state.current_iteration}/{st.session_state.max_iterations}")
    
    with col2:
        progress = st.progress(st.session_state.current_iteration / st.session_state.max_iterations)
    
    with col3:
        if st.session_state.is_optimizing:
            status = "正在优化..."
        else:
            status = "等待操作..."
        st.markdown(f"**状态:** {status}")
    
    # 主要内容
    col1, col2 = st.columns([1, 1])
    
    with col1:
        st.markdown("<h2 class='sub-header'>提示词比较</h2>", unsafe_allow_html=True)
        
        st.markdown("**当前最佳提示**")
        st.text_area("current_best_prompt", value=st.session_state.current_best_prompt, height=200, label_visibility="collapsed")
        
        if st.session_state.new_prompt:
            st.markdown("**新候选提示**")
            st.text_area("new_prompt", value=st.session_state.new_prompt, height=200, label_visibility="collapsed")
        
        if st.session_state.analysis:
            st.markdown("<h2 class='sub-header'>改进分析</h2>", unsafe_allow_html=True)
            st.markdown(st.session_state.analysis)
        
        # 控制按钮
        if not st.session_state.is_optimizing:
            col1, col2 = st.columns(2)
            
            with col1:
                if st.button("继续优化", key="continue_btn"):
                    st.session_state.is_optimizing = True
                    run_optimization_step()
                    st.rerun()
            
            with col2:
                if st.button("完成优化", key="finish_btn"):
                    st.session_state.current_view = "results"
                    st.rerun()
    
    with col2:
        st.markdown("<h2 class='sub-header'>测试样本</h2>", unsafe_allow_html=True)
        
        # 显示样本和输出
        for sample in st.session_state.samples:
            sample_id = sample['id']
            
            with st.expander(f"样本 {sample_id}: {sample['question'][:50]}...", expanded=True):
                st.markdown(f"**问题:** {sample['question']}")
                
                if sample_id in st.session_state.current_best_outputs:
                    st.markdown("**当前输出:**")
                    current_output = st.session_state.current_best_outputs[sample_id]
                    st.markdown(f"<div class='output-container'>{current_output}</div>", unsafe_allow_html=True)
                
                if st.session_state.new_outputs and sample_id in st.session_state.new_outputs:
                    st.markdown("**新输出:**")
                    new_output = st.session_state.new_outputs[sample_id]
                    
                    # 添加评估结果样式
                    css_class = ""
                    if st.session_state.evaluations and sample_id in st.session_state.evaluations:
                        result = st.session_state.evaluations[sample_id]
                        if result == "B更好":
                            css_class = "better"
                        elif result == "A更好":
                            css_class = "worse"
                        else:
                            css_class = "similar"
                    
                    st.markdown(f"<div class='output-container {css_class}'>{new_output}</div>", unsafe_allow_html=True)
                    
                    if st.session_state.evaluations and sample_id in st.session_state.evaluations:
                        result = st.session_state.evaluations[sample_id]
                        st.markdown(f"**评估结果:** {result}")
        
        # 优化历史
        if st.session_state.optimization_history:
            st.markdown("<h2 class='sub-header'>优化历史</h2>", unsafe_allow_html=True)
            
            for item in st.session_state.optimization_history:
                css_class = "better" if item["is_better"] else "not-better"
                
                with st.expander(f"迭代 {item['iteration']} - {'改进成功' if item['is_better'] else '未改进'}", expanded=False):
                    st.markdown(f"**提示词:**")
                    st.text_area(f"prompt_{item['iteration']}", value=item['prompt'], height=100, label_visibility="collapsed")
                    
                    st.markdown("**评估结果:**")
                    for sample_id, result in item['evaluations'].items():
                        st.markdown(f"- 样本 {sample_id}: {result}")
                    
                    st.markdown("**分析:**")
                    st.markdown(item['analysis'])
        
        # 如果是自动模式且正在优化，自动触发下一步
        if st.session_state.auto_mode and st.session_state.is_optimizing and st.session_state.current_iteration > 0:
            run_optimization_step()
            st.rerun()

# 结果视图
def show_results_view():
    st.markdown("<h1 class='main-header'>SPO+ 优化结果</h1>", unsafe_allow_html=True)
    
    # 结果摘要
    st.markdown("<h2 class='sub-header'>优化摘要</h2>", unsafe_allow_html=True)
    
    col1, col2, col3 = st.columns(3)
    
    with col1:
        st.metric("总迭代次数", st.session_state.current_iteration)
    
    with col2:
        better_count = sum(1 for item in st.session_state.optimization_history if item["is_better"])
        st.metric("成功改进次数", better_count)
    
    with col3:
        improvement_rate = better_count / st.session_state.current_iteration if st.session_state.current_iteration > 0 else 0
        st.metric("改进成功率", f"{improvement_rate:.0%}")
    
    # 最终提示词
    st.markdown("<h2 class='sub-header'>最终优化提示词</h2>", unsafe_allow_html=True)
    
    final_prompt = st.text_area("final_prompt", value=st.session_state.current_best_prompt, height=300, label_visibility="collapsed")
    
    if st.button("复制提示词"):
        st.code(st.session_state.current_best_prompt)
        st.success("提示词已复制到剪贴板（可以通过上方代码块复制）")
    
    # 优化历史
    if st.session_state.optimization_history:
        st.markdown("<h2 class='sub-header'>优化历史</h2>", unsafe_allow_html=True)
        
        for item in st.session_state.optimization_history:
            css_class = "better" if item["is_better"] else "not-better"
            
            with st.expander(f"迭代 {item['iteration']} - {'改进成功' if item['is_better'] else '未改进'}", expanded=False):
                st.markdown(f"**提示词:**")
                st.text_area(f"result_prompt_{item['iteration']}", value=item['prompt'], height=100, label_visibility="collapsed")
                
                st.markdown("**评估结果:**")
                for sample_id, result in item['evaluations'].items():
                    st.markdown(f"- 样本 {sample_id}: {result}")
                
                st.markdown("**分析:**")
                st.markdown(item['analysis'])
    
    # 导出和重置按钮
    col1, col2 = st.columns(2)
    
    with col1:
        if st.button("导出历史"):
            export_data = {
                "date": time.strftime("%Y-%m-%d %H:%M:%S"),
                "task_description": st.session_state.task_description,
                "initial_prompt": st.session_state.current_best_prompt,
                "iterations": st.session_state.current_iteration,
                "history": [{
                    "iteration": item["iteration"],
                    "prompt": item["prompt"],
                    "is_better": item["is_better"],
                    "analysis": item["analysis"]
                } for item in st.session_state.optimization_history]
            }
            
            st.download_button(
                label="下载JSON文件",
                data=json.dumps(export_data, ensure_ascii=False, indent=2),
                file_name=f"spo-plus-history-{time.strftime('%Y%m%d-%H%M%S')}.json",
                mime="application/json"
            )
    
    with col2:
        if st.button("开始新的优化"):
            # 重置会话状态
            for key in list(st.session_state.keys()):
                if key != "available_models":
                    del st.session_state[key]
            
            st.session_state.initialized = False
            st.session_state.api_configured = False
            st.session_state.current_view = "config"
            st.session_state.current_iteration = 0
            st.session_state.max_iterations = 10
            st.session_state.samples = []
            st.session_state.current_best_prompt = ""
            st.session_state.current_best_outputs = {}
            st.session_state.new_prompt = ""
            st.session_state.new_outputs = {}
            st.session_state.evaluations = {}
            st.session_state.analysis = ""
            st.session_state.optimization_history = []
            st.session_state.is_optimizing = False
            
            st.rerun()

# 主应用
def main():
    # 侧边栏
    with st.sidebar:
        st.image("https://raw.githubusercontent.com/streamlit/streamlit/master/examples/data/logo.jpg", width=100)
        st.markdown("# SPO+")
        st.markdown("增强型自监督提示优化系统")
        
        st.markdown("---")
        
        if st.button("配置"):
            st.session_state.current_view = "config"
            st.rerun()
        
        if st.session_state.initialized:
            if st.button("优化过程"):
                st.session_state.current_view = "optimization"
                st.rerun()
            
            if st.button("优化结果"):
                st.session_state.current_view = "results"
                st.rerun()
        
        st.markdown("---")
        st.markdown("### 关于")
        st.markdown("""
        SPO+是一个强大的提示词优化系统，结合了自动化优化和人类反馈，帮助用户创建更高质量的提示词。
        
        **特点:**
        - 自动优化
        - 流式输出
        - 人机协作
        - 可视化界面
        """)
    
    # 主内容
    if st.session_state.current_view == "config":
        show_config_view()
    elif st.session_state.current_view == "optimization":
        show_optimization_view()
    elif st.session_state.current_view == "results":
        show_results_view()

if __name__ == "__main__":
    main() 