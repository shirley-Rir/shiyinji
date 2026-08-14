import { MockAIProvider } from "./ai/mock";
import { MockMusicProvider } from "./music/mock";

export const aiProvider = new MockAIProvider();
export const musicProvider = new MockMusicProvider();

export type { AIProvider } from "./ai/types";
export type { MusicProvider } from "./music/types";
