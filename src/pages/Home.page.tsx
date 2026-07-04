import classes from "@/pages/Home.module.css";
import { Button, Center, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <>
      <Title className={classes["title"]} ta="center">
        <Text inherit component="span">
          Silhouette
        </Text>
      </Title>
      <Center mt="xl" style={{ flexDirection: "column", gap: "1rem" }}>
        <Button component={Link} to="/TextualEmulatorV1" size="lg">
          TextualEmulatorV1
        </Button>
        <Button component={Link} to="/TraceViewerV1" size="lg" color="teal">
          TraceViewerV1
        </Button>
        <Button component={Link} to="/StateViewerV1" size="lg" color="teal">
          StateViewerV1
        </Button>
        <Button
          component={Link}
          to="/GameBundleViewerV1"
          size="lg"
          color="teal"
        >
          GameBundleViewerV1
        </Button>
        <Button component={Link} to="/VisualEmulatorV1" size="lg" color="teal">
          VisualEmulatorV1
        </Button>
      </Center>
    </>
  );
}
