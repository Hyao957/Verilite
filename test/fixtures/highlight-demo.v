`timescale 1ns / 1ps
`define DEPTH 16

// 覆盖场景：跨行带参例化、单行例化、位宽、变址位选、
// 多维数组、三重嵌套 begin-end、非阻塞与阻塞赋值、x/z 未知态

module highlight_demo #(
    parameter integer WIDTH = 8,
    parameter DEPTH = `DEPTH,
    localparam ADDRW = 4
) (
    input  wire                    clk,
    input  wire                    rst_n,
    input  wire signed [WIDTH-1:0] din,
    input  wire        [ADDRW-1:0] addr,
    output reg         [WIDTH-1:0] dout,
    output wire                    valid
);

    reg [WIDTH-1:0] mem [0:DEPTH-1];
    reg [7:0][3:0] nibbles;
    wire [3:0] slice_up;
    wire [3:0] slice_dn;
    integer i;
    genvar g;

    always @(*) begin

    end

    reg [20-1:0] name;

    // TODO(2026-07-28): what
    genvar i;
    generate
        for (i = 0; i < N; i = i + 1) begin : gen_block


        end
    endgenerate




    assign slice_up = din[addr +: 4];
    assign slice_dn = din[addr -: 4];
    assign valid = (dout !== {WIDTH{1'bx}});

    always @(posedge clk or negedge rst_n) begin : main_proc
        if (!rst_n) begin
            dout <= {WIDTH{1'b0}};
            for (i = 0; i < DEPTH; i = i + 1) begin
                mem[i] <= 8'h00;
            end
        end else begin
            case (addr[1:0])
                2'b00: dout <= mem[addr];
                2'b01: dout <= 8'hFF;
                2'b10: dout <= 8'bxxxx_zzzz;
                default: begin
                    dout <= 8'dx;
                end
            endcase
        end
    end

    always @(*) begin
        nibbles[0] = din[3:0];
        nibbles[1] = din[7:4];
    end

    // 跨行带参例化
    sub_block #( .WIDTH (WIDTH), .DEPTH (DEPTH)) u_sub_a (
        .clk (clk),
        .rst_n (rst_n),
        .din (din[WIDTH-1:0]),
        .dout ()
    );

    // 单行带参例化
    sub_block #(.WIDTH(4), .DEPTH(2)) u_sub_b (.clk(clk), .rst_n(rst_n), .din(4'h5), .dout());

    // 无参例化
    simple_gate u_gate (
        .a (din[0]),
        .b (din[1]),
        .y (slice_up[0])
    );

    generate
        for (g = 0; g < 2; g = g + 1) begin : gen_loop
            sub_block #(.WIDTH(WIDTH)) u_gen (
                .clk (clk),
                .rst_n (rst_n),
                .din (din),
                .dout ()
            );
        end
    endgenerate

    initial begin
        #10;
        $display( "addr=%h dout=%b", addr, dout);
        $finish;
    end

    // 这一行不应被识别为例化
    function automatic [WIDTH-1:0] clip (input [WIDTH-1:0] v);
        clip = (v > 8'd200) ? 8'd200 : v;
    endfunction

    always (posedge clk or negedge rst_n) begin
        if (cond) begin

        end
        else begin

        end
    end

endmodule

module name (
    input  wire clk,
    input  wire rst_n,
    input  wire din,
    output reg  dout,
    input wire [10-1:0] std,
    
);
    reg [WIDTH-1:0] name;


    always @(*) begin
        out = 1'b0;

    end

    always @(*) begin
        out = 1'b0;

    end

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            q <= 1'b0;
        end else begin

        end
    end
    
    
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            test <= 1'b0;
        end else begin
            
        end
    end

    
endmodule

module name (
    input  wire          clk,
    input  wire          rst_n,
    input  wire          din,
    output reg           dout,
    input  wire [1000:0] sd
);


    function [7:0] name;
        input [7:0] arg;
        begin
            name = arg;
        end
    endfunction
endmodule