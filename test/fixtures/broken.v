// Deliberately broken file. Open it to see every VeriLite diagnostic at once.
module broken (
    input  wire clk,
    input  wire rst_n,
    output reg  q
);

    wire a          // missing semicolon
    reg  b;

    assign c = (a + b;         // unbalanced bracket

    always begin               // no sensitivity list
        q = 1'b0;
    end

    always @(posedge clk) begin
        q = d;                 // blocking assignment in sequential logic
    end

    always @(*) begin
        case (b)               // no default branch
            1'b0: e <= 1'b1;   // non-blocking in combinational logic
        endcase
    end

    initial begin
        $display("unterminated);

endmodule
