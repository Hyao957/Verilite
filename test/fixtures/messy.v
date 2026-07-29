// Ugly on purpose. Press Shift+Alt+F to see the formatter work.
`timescale 1ns/1ps
module messy #(
    parameter WIDTH = 8,
    parameter DEPTH = 16
)(
    input  wire             clk,
    input  wire             rst_n,
    input  wire [WIDTH-1:0] din,
    input  wire             wr_en,
    output reg  [WIDTH-1:0] dout,
    output wire             full
);
    reg [WIDTH-1:0] mem [0:DEPTH-1];
    reg [7:0] wptr;
    assign full = (wptr == DEPTH-1);
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            wptr <= 0;
            dout <= 0;
        end
        else begin
            if (wr_en && !full) begin
                mem[wptr] <= din;
                wptr <= wptr+1;
            end
            dout <= mem[wptr];
        end
    end
endmodule
