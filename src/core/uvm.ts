/**
 * UVM (Universal Verification Methodology) knowledge for SystemVerilog.
 *
 * UVM is a class library rather than part of the language grammar, so these
 * names are deliberately kept out of the keyword set: they must not affect
 * highlighting or the lexer. They only feed completion and hover.
 */

export type UvmKind = "class" | "method" | "macro";

export interface UvmEntry {
	/** e.g. "uvm_driver", or "uvm_component_utils" for a macro (no leading backtick) */
	name: string;
	kind: UvmKind;
	/** category shown as the completion detail */
	group: string;
	doc: string;
}

export const UVM_ENTRIES: readonly UvmEntry[] = [
	{ name: "uvm_object", kind: "class", group: "UVM 基础组件", doc: "所有 UVM 数据类的基类，提供 copy、clone、compare、print" },
	{ name: "uvm_component", kind: "class", group: "UVM 基础组件", doc: "所有 UVM 树形组件的基类，拥有 parent 与 phase 机制" },
	{ name: "uvm_transaction", kind: "class", group: "UVM 基础组件", doc: "旧式事务基类，已被 uvm_sequence_item 取代" },
	{ name: "uvm_sequence_item", kind: "class", group: "UVM 基础组件", doc: "事务基类，sequence 与 driver 之间传递的数据单元" },
	{ name: "uvm_sequence", kind: "class", group: "UVM 基础组件", doc: "序列基类，产生激励事务流" },
	{ name: "uvm_sequencer", kind: "class", group: "UVM 基础组件", doc: "序列器，仲裁 sequence 并把事务转交 driver" },
	{ name: "uvm_driver", kind: "class", group: "UVM 基础组件", doc: "驱动器，把事务转换为 DUT 引脚时序" },
	{ name: "uvm_monitor", kind: "class", group: "UVM 基础组件", doc: "监视器，采样 DUT 信号并还原为事务" },
	{ name: "uvm_agent", kind: "class", group: "UVM 验证环境", doc: "代理，封装 driver、sequencer 与 monitor" },
	{ name: "uvm_env", kind: "class", group: "UVM 验证环境", doc: "验证环境，组合若干 agent 与 scoreboard" },
	{ name: "uvm_test", kind: "class", group: "UVM 验证环境", doc: "测试用例基类，run_test() 启动的顶层组件" },
	{ name: "uvm_scoreboard", kind: "class", group: "UVM 验证环境", doc: "记分板，比对参考模型与 DUT 输出" },
	{ name: "uvm_subscriber", kind: "class", group: "UVM 验证环境", doc: "订阅 analysis 端口，用于覆盖率和检查器" },
	{ name: "uvm_factory", kind: "class", group: "UVM Factory", doc: "工厂，按类型名或覆盖规则创建对象" },
	{ name: "uvm_component_registry", kind: "class", group: "UVM Factory", doc: "组件注册表，配合 uvm_component_utils 宏使用" },
	{ name: "uvm_object_registry", kind: "class", group: "UVM Factory", doc: "对象注册表，配合 uvm_object_utils 宏使用" },
	{ name: "set_type_override_by_type", kind: "method", group: "UVM Factory", doc: "按类型覆盖工厂中注册的类型" },
	{ name: "set_inst_override_by_type", kind: "method", group: "UVM Factory", doc: "按实例路径覆盖工厂中注册的类型" },
	{ name: "uvm_config_db", kind: "class", group: "UVM Config DB", doc: "配置数据库，跨层次传递参数，用 set/get 存取" },
	{ name: "uvm_resource_db", kind: "class", group: "UVM Config DB", doc: "资源数据库，uvm_config_db 的底层实现" },
	{ name: "uvm_analysis_port", kind: "class", group: "UVM TLM", doc: "analysis 端口，一对多广播事务" },
	{ name: "uvm_analysis_export", kind: "class", group: "UVM TLM", doc: "analysis 输出口" },
	{ name: "uvm_analysis_imp", kind: "class", group: "UVM TLM", doc: "analysis 输入实现，需配合 uvm_analysis_imp_decl 宏" },
	{ name: "uvm_tlm_fifo", kind: "class", group: "UVM TLM", doc: "TLM FIFO，用于组件之间数据缓冲" },
	{ name: "uvm_tlm_analysis_fifo", kind: "class", group: "UVM TLM", doc: "带分析端口的 TLM FIFO，常用于 scoreboard" },
	{ name: "uvm_blocking_put_port", kind: "class", group: "UVM TLM", doc: "阻塞 put 端口" },
	{ name: "uvm_nonblocking_put_port", kind: "class", group: "UVM TLM", doc: "非阻塞 put 端口" },
	{ name: "uvm_blocking_get_port", kind: "class", group: "UVM TLM", doc: "阻塞 get 端口" },
	{ name: "uvm_nonblocking_get_port", kind: "class", group: "UVM TLM", doc: "非阻塞 get 端口" },
	{ name: "uvm_blocking_peek_port", kind: "class", group: "UVM TLM", doc: "阻塞 peek 端口" },
	{ name: "uvm_port", kind: "class", group: "UVM TLM", doc: "TLM 端口基类" },
	{ name: "uvm_export", kind: "class", group: "UVM TLM", doc: "TLM 输出口基类" },
	{ name: "uvm_imp", kind: "class", group: "UVM TLM", doc: "TLM 实现基类" },
	{ name: "build_phase", kind: "method", group: "UVM Phase", doc: "创建并配置子组件，自顶向下执行" },
	{ name: "connect_phase", kind: "method", group: "UVM Phase", doc: "连接组件之间的 TLM 端口，自底向上执行" },
	{ name: "end_of_elaboration_phase", kind: "method", group: "UVM Phase", doc: "细化检查，可打印组件拓扑" },
	{ name: "start_of_simulation_phase", kind: "method", group: "UVM Phase", doc: "仿真开始前的准备" },
	{ name: "run_phase", kind: "method", group: "UVM Phase", doc: "运行激励与监测，task 类型，与动态 phase 并行" },
	{ name: "reset_phase", kind: "method", group: "UVM Phase", doc: "复位阶段" },
	{ name: "configure_phase", kind: "method", group: "UVM Phase", doc: "配置阶段" },
	{ name: "main_phase", kind: "method", group: "UVM Phase", doc: "主激励阶段" },
	{ name: "shutdown_phase", kind: "method", group: "UVM Phase", doc: "收尾阶段" },
	{ name: "extract_phase", kind: "method", group: "UVM Phase", doc: "提取统计信息" },
	{ name: "check_phase", kind: "method", group: "UVM Phase", doc: "检查结果，自底向上执行" },
	{ name: "report_phase", kind: "method", group: "UVM Phase", doc: "输出仿真报告" },
	{ name: "final_phase", kind: "method", group: "UVM Phase", doc: "仿真结束前的最后清理" },
	{ name: "phase_ready_to_end", kind: "method", group: "UVM Phase", doc: "phase 结束前的收尾回调" },
	{ name: "raise_objection", kind: "method", group: "UVM Phase", doc: "提起 objection，阻止 phase 提前结束" },
	{ name: "drop_objection", kind: "method", group: "UVM Phase", doc: "撤销 objection" },
	{ name: "uvm_component_utils", kind: "macro", group: "UVM 宏", doc: "注册 uvm_component 派生类到工厂" },
	{ name: "uvm_object_utils", kind: "macro", group: "UVM 宏", doc: "注册 uvm_object 派生类到工厂" },
	{ name: "uvm_component_param_utils", kind: "macro", group: "UVM 宏", doc: "注册带参数的组件类" },
	{ name: "uvm_object_param_utils", kind: "macro", group: "UVM 宏", doc: "注册带参数的对象类" },
	{ name: "uvm_analysis_imp_decl", kind: "macro", group: "UVM 宏", doc: "声明 analysis 实现类，支持多个 write 方法" },
	{ name: "uvm_field_int", kind: "macro", group: "UVM 宏", doc: "声明整型字段，供自动化 copy/compare/print 使用" },
	{ name: "uvm_field_object", kind: "macro", group: "UVM 宏", doc: "声明对象字段，供自动化 copy/compare/print 使用" },
	{ name: "uvm_info", kind: "macro", group: "UVM 宏", doc: "打印信息级日志" },
	{ name: "uvm_warning", kind: "macro", group: "UVM 宏", doc: "打印告警级日志" },
	{ name: "uvm_error", kind: "macro", group: "UVM 宏", doc: "打印错误级日志并计数" },
	{ name: "uvm_fatal", kind: "macro", group: "UVM 宏", doc: "打印致命错误并结束仿真" },
	{ name: "uvm_do", kind: "macro", group: "UVM 宏", doc: "在 sequence 中随机化并启动一个 item 或 sequence" },
	{ name: "uvm_do_with", kind: "macro", group: "UVM 宏", doc: "带内联约束地启动 item" },
	{ name: "uvm_send", kind: "macro", group: "UVM 宏", doc: "发送已构造好的 item" },
	{ name: "uvm_create", kind: "macro", group: "UVM 宏", doc: "创建 item 实例" },
	{ name: "create", kind: "method", group: "UVM 常用方法", doc: "工厂创建：create_component 或 create_object" },
	{ name: "get_type_name", kind: "method", group: "UVM 常用方法", doc: "获取工厂注册的类名" },
	{ name: "get_full_name", kind: "method", group: "UVM 常用方法", doc: "获取完整层次路径名" },
	{ name: "get_parent", kind: "method", group: "UVM 常用方法", doc: "获取父组件" },
];

const UVM_BY_NAME = new Map(UVM_ENTRIES.map((e) => [e.name.toLowerCase(), e]));

/** Look up a UVM class, method or macro by name (case-insensitive). */
export function uvmEntryFor(name: string): UvmEntry | undefined {
	return UVM_BY_NAME.get(name.toLowerCase());
}

/** All UVM entries of the given kind, in declaration order. */
export function uvmEntriesOfKind(kind: UvmKind): UvmEntry[] {
	return UVM_ENTRIES.filter((e) => e.kind === kind);
}
