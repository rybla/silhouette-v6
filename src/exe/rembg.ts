import { removeBackground } from "@/core/rembg";
import { argument, object } from "@optique/core";
import { path, run } from "@optique/run";

const args = run(
  object({
    input: argument(
      path({
        mustExist: true,
        extensions: [".png", ".jpg", ".jpeg"],
      })
    ),
  })
);

removeBackground(args.input);
