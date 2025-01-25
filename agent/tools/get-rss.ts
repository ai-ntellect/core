import Parser from "rss-parser";
import { z } from "zod";

const RSS_FEEDS = [
  "https://www.investing.com/rss/news_301.rss",
  "https://cointelegraph.com/rss/category/analysis",
  "https://cointelegraph.com/rss/category/top-10-cryptocurrencies",
];

const parser = new Parser();

function stripHtmlTags(content: string): string {
  if (!content) return "";
  return content
    .replace(/<[^>]*>/g, "")
    .replace(/\n/g, "")
    .replace(" ", "");
}

export const getRssNews = {
  name: "get-news-rss",
  description: "Get latest news about on website",
  parameters: z.object({}),
  execute: async () => {
    const itemsPerSource = 5;

    try {
      const feedPromises = RSS_FEEDS.map((url) => parser.parseURL(url));
      const results = await Promise.allSettled(feedPromises);
      const successfulFeeds = results
        .filter(
          (result): result is PromiseFulfilledResult<Parser.Output<any>> => {
            return (
              result.status === "fulfilled" && result.value?.items?.length > 0
            );
          }
        )
        .map((result) => result.value);
      const allItems = successfulFeeds
        .flatMap((feed) => feed.items.slice(0, itemsPerSource))
        .sort((a, b) => {
          const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
          const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, 5)
        .map((item) => ({
          title: item.title,
          content: stripHtmlTags(item.content),
          link: item.link,
          date: item.pubDate,
          source: item.creator || new URL(item.link).hostname,
        }));

      const result = {
        status: "success",
        items: allItems,
      };
      return result;
    } catch (error: any) {
      throw error;
    }
  },
};
