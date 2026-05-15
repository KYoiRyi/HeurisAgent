import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  async get() {
    return this.settings.get();
  }

  @Put()
  async update(
    @Body()
    body: { provider?: string; baseUrl?: string; apiKey?: string; model?: string },
  ) {
    return this.settings.update(body);
  }

  @Post("reset")
  async reset() {
    return this.settings.reset();
  }
}
