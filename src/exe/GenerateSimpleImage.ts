import { OpenRouter } from "@openrouter/sdk";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const client = new OpenRouter({
  apiKey: process.env["OPENROUTER_API_KEY"]!,
});

const resultFilepath = "asset/image/misc/GenerateSimpleImage-result-v3.json";

if (!fs.existsSync(resultFilepath)) {
  const result = await client.chat.send({
    chatRequest: {
      modalities: ["image"],
      model: "bytedance-seed/seedream-4.5",
      imageConfig: {
        aspect_ratio: "3:4",
        resolution: "1K",
      },
      messages: [
        {
          role: "user",
          content:
            "A claymation character in a neutral pose facing forwards. Background is a completely flat featureless gray color.",
        },
      ],
    },
  });

  fs.writeFileSync(resultFilepath, JSON.stringify(result), {
    encoding: "utf-8",
  });
}

const result = JSON.parse(
  fs.readFileSync(resultFilepath, { encoding: "utf-8" })
) as {
  choices: Array<{
    message: {
      images: Array<{
        imageUrl: {
          url: string;
        };
      }>;
    };
  }>;
};

const dataUrl = result.choices[0]!.message.images[0]!.imageUrl.url;
const matches = dataUrl.match(
  /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/
);
if (matches === null) {
  console.error(`matches === ${matches}`);
  process.exit(1);
}
const mimeType = matches[1]!;
const base64Data = matches[2]!;
const extension = mimeType.split("/")[1]!.split("+")[0]!;
const buffer = Buffer.from(base64Data, "base64");

fs.writeFileSync(resultFilepath.replace(".json", `.${extension}`), buffer);
