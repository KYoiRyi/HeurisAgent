import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { LlmService, type ChatMessage, type LLMOptions } from "./llm.service";
import { SettingsService } from "@/modules/settings/settings.service";

interface ChatCompletionsBody {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: LLMOptions["tools"];
  tool_choice?: LLMOptions["tool_choice"];
}

@Controller("v1")
export class LlmController {
  constructor(
    private readonly llm: LlmService,
    private readonly settings: SettingsService,
  ) {}

  @Get("health")
  async health() {
    return this.llm.health();
  }

  @Get("models")
  async models() {
    const health = await this.llm.health();
    const ids = health.models ?? [];
    const data = ids.map((id) => ({ id, object: "model", owned_by: health.provider ?? "heuris" }));
    return { object: "list", data };
  }

  @Post("chat/completions")
  @HttpCode(HttpStatus.OK)
  async chat(@Body() body: ChatCompletionsBody, @Res() res: Response) {
    const opts: LLMOptions = {
      model: body.model,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      tools: body.tools,
      tool_choice: body.tool_choice,
    };

    if (!body.stream) {
      const result = await this.llm.invoke(body.messages, opts);
      const id = `chatcmpl-${Date.now().toString(36)}`;
      res.json({
        id,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: result.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: result.content,
              ...(result.tool_calls ? { tool_calls: result.tool_calls } : {}),
            },
            finish_reason: result.tool_calls ? "tool_calls" : "stop",
          },
        ],
        usage: result.usage,
      });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const id = `chatcmpl-${Date.now().toString(36)}`;
    const created = Math.floor(Date.now() / 1000);
    const model = body.model ?? this.settings.getActiveModel().id;

    try {
      for await (const delta of this.llm.stream(body.messages, opts)) {
        res.write(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
          })}\n\n`,
        );
      }
      res.write(
        `data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        })}\n\n`,
      );
      res.write("data: [DONE]\n\n");
    } catch (err) {
      const message = err instanceof Error ? err.message : "stream error";
      res.write(`data: ${JSON.stringify({ error: { message } })}\n\n`);
    } finally {
      res.end();
    }
  }
}
