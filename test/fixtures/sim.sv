`timescale 1ns/1ps

class test



endclass



//======================================================================
// mg_proto_engine 自检 Testbench
//======================================================================
module tb_mg_proto_engine;
    //-------------------- 时钟 / 复位 --------------------
    logic clk   = 1'b0;
    logic rst_n = 1'b0;
    always #5 clk = ~clk; // 100 MHz

    //-------------------- DUT 信号 --------------------
    logic [7:0] pkt_data;
    logic pkt_valid, pkt_last;
    logic pkt_ready;

    logic [7:0] resp_data;
    logic resp_valid, resp_last;
    logic resp_ready;

    logic key_bram_en; logic [9:0] key_bram_addr; logic [255:0] key_bram_wdata;
    logic ip_bram_en; logic [9:0] ip_bram_addr; logic [127:0] ip_bram_wdata;
    logic value_bram_en; logic [9:0] value_bram_addr; logic [287:0] value_bram_wdata;

    logic        hash_req;
    logic [ 1:0] hash_op;
    logic [15:0] hash_key;
    logic [ 7:0] hash_value;
    logic        hash_rdy;
    logic hash_rsp_vld, hash_rsp_hit;
    logic [9:0] hash_rsp_addr;
    logic [7:0] hash_rsp_value;
    logic       hash_rsp_fail;

    wire [4:0] ip_words = key_add_flag ? 5'd2 : 5'd0;   // IP 预导字数
    wire [4:0] last_cnt = key_add_flag ? 5'd25 : 5'd2;  // 末字计数
    wire       in_data  = (udp_flash_cnt >= ip_words);  // 是否已进入 key 数据区

    logic [31:0] stat_pkt_rx0_cnt, stat_pkt_tx0_cnt,
        stat_pkt_rx1_cnt, stat_pkt_tx1_cnt,
        stat_pkt_rx2_cnt, stat_pkt_tx2_cnt,
        stat_pkt_rx3_cnt, stat_pkt_tx3_cnt;

    //-------------------- 指令 / 应答码 --------------------
    localparam byte unsigned CMD_ADD_TYPE = 8'h10, RSP_ADD_TYPE = 8'h11;
    localparam byte unsigned CMD_ADD_KEY  = 8'h12, RSP_ADD_KEY = 8'h13;
    localparam byte unsigned CMD_UPD_KEY  = 8'h14, RSP_UPD_KEY = 8'h15;
    localparam byte unsigned CMD_QRY_STAT = 8'h16, RSP_QRY_STAT = 8'h17;
    localparam byte unsigned CODE_OK      = 8'h00, CODE_FAIL = 8'hFF;

    //-------------------- DUT 实例（端口同名，用 .* 连接）--------------------
    mg_proto_engine dut (.*);

    //-------------------- hash 响应模型 --------------------
    // 收到 hash_req 后下一拍返回成功，地址固定 HASH_ADDR。
    // 可自行改造为带延迟计数器 / 注入 hash_rsp_fail 的版本。
    localparam [9:0] HASH_ADDR = 10'h020;
    initial hash_rdy = 1'b1;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            hash_rsp_vld <= 1'b0; hash_rsp_hit <= 1'b0;
            hash_rsp_addr <= 10'd0; hash_rsp_value <= 8'd0; hash_rsp_fail <= 1'b0;
        end else begin
            hash_rsp_vld <= 1'b0;
            if (hash_req && hash_rdy) begin
                hash_rsp_vld <= 1'b1;
                hash_rsp_hit <= 1'b1;
                hash_rsp_addr <= HASH_ADDR;
                hash_rsp_value <= hash_value;
                hash_rsp_fail <= 1'b0;
            end
        end
    end

    //-------------------- key BRAM 写监视 --------------------
    logic         key_written;
    logic [  9:0] key_addr_seen;
    logic [255:0] key_data_seen;
    always @(posedge clk) begin
        if (!rst_n) 
            key_written <= 1'b0;
        else if (key_bram_en) begin
            key_written <= 1'b1;
            key_addr_seen <= key_bram_addr;
            key_data_seen <= key_bram_wdata;
            $display( "[%0t] KEY_BRAM wr addr=0x%03h wdata=0x%064h", $time, key_bram_addr, key_bram_wdata);
        end
    end

    //-------------------- 全局错误计数 --------------------
    int errors = 0;

    //-------------------- 发送一包（指令 + 负载）--------------------
    task automatic send_pkt(input byte unsigned bq[$]);
        foreach (bq[i]) begin
            @(negedge clk);
            pkt_data = bq[i];
            pkt_valid = 1'b1;
            pkt_last = (i == bq.size()-1);
            @(posedge clk);
            while (!pkt_ready) @(posedge clk); // 反压等待
        end
        @(negedge clk);
        pkt_valid = 1'b0;
        pkt_last = 1'b0;
    endtask

    //-------------------- 按“指令 + 长度”生成一包 --------------------
    // 指令字节后按 len 自动生成 len 个递增数据字节(起始值 start)
    task automatic send_cmd(input byte unsigned cmd,
            input int len,
            input byte unsigned start = 8'h00);
        byte unsigned q[$];
        q.delete();
        q.push_back(cmd);
        for (int k = 0; k < len; k++)
            q.push_back(start + k[7:0]);
        send_pkt(q);
    endtask

    //-------------------- 收一包应答 --------------------
    task automatic recv_resp(ref byte unsigned q[$]);
        q.delete();
        forever begin
            @(posedge clk);
            if (resp_valid && resp_ready) begin
                q.push_back(resp_data);
                if (resp_last) break;
            end
        end
    endtask

    //-------------------- 比较应答 --------------------
    task automatic check_resp(input string name,
            input byte unsigned got[$],
            input byte unsigned exp[$]);
        int local_err = 0;
        if (got.size() != exp.size()) begin
            $error( "[%s] 长度不匹配: got=%0d exp=%0d", name, got.size(), exp.size());
            local_err++;
        end else begin
            foreach (exp[i])
                if (got[i] !== exp[i]) begin
                    $error( "[%s] 第%0d字节不匹配: got=0x%02h exp=0x%02h", name, i, got[i], exp[i]);
                    local_err++;
                end
        end
        if (local_err == 0) $display( "[%s] PASS", name);
        errors + = local_err;
    endtask

    //-------------------- 工具：压入 32bit 大端 --------------------
    function automatic void push_be32(ref byte unsigned q[$], input logic [31:0] v);
        q.push_back(v[31:24]); q.push_back(v[23:16]);
        q.push_back(v[15:8]); q.push_back(v[7:0]);
    endfunction

    

    //-------------------- 主测试流程 --------------------
    byte unsigned rx[$], exp[$];

    initial begin
        // 初值
        pkt_data = 8'h00; pkt_valid = 1'b0; pkt_last = 1'b0; resp_ready = 1'b1;
        stat_pkt_rx0_cnt = 32'h0000_0001; stat_pkt_tx0_cnt = 32'h0000_0002;
        stat_pkt_rx1_cnt = 32'h0000_0003; stat_pkt_tx1_cnt = 32'h0000_0004;
        stat_pkt_rx2_cnt = 32'h0000_0005; stat_pkt_tx2_cnt = 32'h0000_0006;
        stat_pkt_rx3_cnt = 32'h0000_0007; stat_pkt_tx3_cnt = 32'h0000_0008;

        // 复位
        rst_n = 1'b0; repeat (5) @(posedge clk);
        rst_n = 1'b1; repeat (2) @(posedge clk);

        // ---- 测试1: 0x10 增加类型 ----
        fork send_cmd(CMD_ADD_TYPE, 36, 8'h01); recv_resp(rx); join
        exp = {RSP_ADD_TYPE, CODE_OK};
        check_resp( "ADD_TYPE", rx, exp);

        // ---- 测试2: 0x12 增加key（校验 hash 地址写入 key_bram）----
        key_written = 1'b0;
        fork send_cmd(CMD_ADD_KEY, 51, 8'h11); recv_resp(rx); join // 指令+3字节: key=0x1112, value=0x13
        exp = {RSP_ADD_KEY, CODE_OK};
        check_resp( "ADD_KEY", rx, exp);
        if (!key_written) begin
            $error( "ADD_KEY: 未写 key_bram"); errors++;
        end else if (key_addr_seen !== HASH_ADDR[9:0]) begin
            $error( "ADD_KEY: key_bram 地址错误 got=0x%03h exp=0x%03h", key_addr_seen, HASH_ADDR[9:0]);
            errors++;
        end else $display( "ADD_KEY: key_bram 地址正确 0x%03h", key_addr_seen);

        // ---- 测试3: 0x14 更新key ----
        key_written = 1'b0;
        fork send_cmd(CMD_UPD_KEY, 51, 8'hAA); recv_resp(rx); join // key=0xAAAB, value=0xAC
        exp = {RSP_UPD_KEY, CODE_OK};
        check_resp( "UPD_KEY", rx, exp);
        if (!key_written) begin $error( "UPD_KEY: 未写 key_bram"); errors++; end

        // ---- 测试4: 0x16 查询状态上报 ----
        fork send_cmd(CMD_QRY_STAT, 0); recv_resp(rx); join // 无负载
        exp.delete();
        exp.push_back(RSP_QRY_STAT);
        push_be32(exp, stat_pkt_rx0_cnt); push_be32(exp, stat_pkt_tx0_cnt);
        push_be32(exp, stat_pkt_rx1_cnt); push_be32(exp, stat_pkt_tx1_cnt);
        push_be32(exp, stat_pkt_rx2_cnt); push_be32(exp, stat_pkt_tx2_cnt);
        push_be32(exp, stat_pkt_rx3_cnt); push_be32(exp, stat_pkt_tx3_cnt);
        check_resp( "QRY_STAT", rx, exp);

        // ---- 汇总 ----
        if (errors == 0) $display( "==== ALL TESTS PASSED ====");
        else             $display( "==== %0d ERROR(S) ====", errors);
        repeat (5) @(posedge clk);
        $finish;
    end

    //-------------------- 超时保护 --------------------
    initial begin
        #100000;
        $error( "TIMEOUT: 仿真超时");
        $finish;
    end

    //-------------------- 波形 --------------------
    initial begin
        $dumpfile( "tb_mg_proto_engine.vcd");
        $dumpvars(0, tb_mg_proto_engine);
    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            agent_addr <= 14'h0;
        else begin
            case (cur_state)
                S_READ_KEY:
                    agent_addr <= FLASH_KEY_BASE_ADDR + block_cnt[13:0];
                S_READ_EMG_KEY:
                    agent_addr <= FLASH_EMG_KEY_BASE_ADDR + block_cnt[13:0];
                S_READ_CONFIG:
                    agent_addr <= FLASH_CONFIG_BASE_ADDR + block_cnt[13:0];
                S_READ_REQ:
                    agent_addr <= {1'b0, err_corr_addr_r};
                S_SELF_REQ:
                    agent_addr <= {1'b0, block_cnt[12:0]};
                S_ERASE_REQ,
                S_DONE:
                    agent_addr <= {block_cnt[8:0],5'h0};
                default:
                    agent_addr <= agent_addr;  // 保持不变，可省略
            endcase
        end
    end
    


endmodule

