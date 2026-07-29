`timescale 1ns / 1ps

module fsm (
    input  wire clk,
    input  wire rst_n,
    input  wire start,
    input  wire done,
    output reg  busy
);

    localparam IDLE = 2'd0,
        WORK = 2'd1,
        STOP = 2'd2;


    reg [1:0] state, next_state;

    // 1. state register
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            state <= IDLE;
        else
            state <= next_state;
    end

    // 2. next state logic
    always @(*) begin
        next_state = state;
        case (state)
            IDLE: if (start) next_state = WORK;
            WORK: if (done) next_state = STOP;
            STOP: next_state = IDLE;
            default: next_state = IDLE;
        endcase
    end

    // 3. output logic
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            busy <= 1'b0;
        else
            busy <= (next_state == WORK);
    end

    reg [7:0] cnt;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) cnt <= 0;
        else if (cnt == MAX) cnt <= 0;
        else cnt <= cnt + 1'b1;
    end

    genvar i;
    generate
        for (i = 0; i < 8'd5; i = i + 1) begin : gen_block
            if (cond) begin
                if (cond) begin
                    if (cond) begin
                        if (cond) begin
                            
                        end
                    end
                end
            end else if (cond) begin
                
            end else begin
                
            end
        end
    endgenerate

    // #region name
    
    
    // #endregion
    
    reg [7:0] cnt;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)              cnt <= 0;
        else if (cnt == MAX) cnt <= 0;
        else                          cnt <= cnt + 1'b1;
    end
    

    reg [7:0] cnt;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)              cnt <= 0;
        else if (cnt == MAX) cnt <= 0;
        else                          cnt <= cnt + 1'b1;
    end 

    genvar i;
    generate
        for (i = 0; i < N; i = i + 1) begin : gen_block
            
        end
    endgenerate

    reg [7:0] shift_reg;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) shift_reg <= 0;
        else            shift_reg <= {shift_reg[7-1:0], din};
    end
       
    reg sig_d1, sig_d2;
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            sig_d1 <= 1'b0;
            sig_d2 <= 1'b0;
        end else begin
            sig_d1 <= sig;
            sig_d2 <= sig_d1;
        end
    end

    assign out = cond ? a : b;



    task name;
        input arg;
        begin
            
        end
    endtask

    function [7:0] name;
        input [7:0] arg;
        begin
            name = arg;
        end
    endfunction

    reg clk;
    initial begin
        clk = 1'b0;
        forever #5 clk = ~clk;
    end

    reg rst_n;
    initial begin
        rst_n = 1'b0;
        #100;
        rst_n = 1'b1;
    end

    // ---------------- section ----------------
    
    // TODO(2026-07-28): what

    localparam IDLE = 2'd0;
    localparam RUN  = 2'd1;
    localparam DONE = 2'd2;
    
    reg [1:0] state, next_state;
    
    // 1. 状态寄存
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= IDLE;
        else            state <= next_state;
    end
    
    // 2. 次态逻辑
    always @(*) begin
        next_state = state;
        case (state)
            IDLE: if (start) next_state = RUN;
            RUN : if (done)  next_state = DONE;
            DONE: next_state = IDLE;
            default  : next_state = IDLE;
        endcase
    end
    
    // 3. 输出逻辑
    always @(*) begin
        busy = (state == RUN);
    end

    localparam IDLE = 2'd0;
    localparam RUN  = 2'd1;
    localparam DONE = 2'd2;
    
    reg [1:0] state, next_state;
    
    // 1. 状态寄存
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) state <= IDLE;
        else            state <= next_state;
    end
    
    // 2. 次态逻辑
    always @(*) begin
        next_state = state;
        case (state)
            IDLE: if (start) next_state = RUN;
            RUN : if (done)  next_state = DONE;
            DONE: next_state = IDLE;
            default  : next_state = IDLE;
        endcase
    end
    // 3. 输出逻辑
    always @(*) begin
        busy = (state == RUN);
    end
    
    
endmodule
 

