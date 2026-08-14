import type { Metadata } from "next";
import { MusicApp } from "./music-app";

export const metadata: Metadata = {
  title: "拾音记",
  description: "把此刻，变成一首歌。",
};

export default function Home() {
  return <MusicApp />;
}
