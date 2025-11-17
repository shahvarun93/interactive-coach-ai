"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const health_1 = __importDefault(require("./routes/health"));
const users_1 = __importDefault(require("./routes/users")); // we'll create this file in a bit
const system_design_1 = __importDefault(require("./routes/system-design"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use(express_1.default.json());
// Routes
app.use(health_1.default);
app.use('/users', users_1.default); // base path for user routes
app.use('/system-design', system_design_1.default);
app.listen(PORT, () => {
    console.log(`API server running at http://localhost:${PORT}`);
});
