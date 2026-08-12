---
title: NextUI Text
description: NextUI Text 설명입니다
date: "2022-10-13"
categories:
  - NextJS
  - NextUI
tags:
  - nextjs
  - nextui
  - text
  - react ui library
author: Anzy
---

## **Text**

Text component is the used to render text and paragraphs within an interface using well-defined typographic styles. It renders a `<p>` tag by default.

```jsx
import { Text } from "@nextui-org/react";
```

### **Headings**

Headings `h1..h6` are titles or subtitles that you want to display on a webpage.

# Almost before we knew it, we had left the ground.

## Almost before we knew it, we had left the ground.

### Almost before we knew it, we had left the ground.

#### Almost before we knew it, we had left the ground.

##### Almost before we knew it, we had left the ground.

###### Almost before we knew it, we had left the ground.

```jsx
import { Text } from "@nextui-org/react";

export default function App() {
  const text = "Almost before we knew it, we had left the ground.";
  return (
    <>
      <Text h1>{text}</Text>
      <Text h2>{text}</Text>
      <Text h3>{text}</Text>
      <Text h4>{text}</Text>
      <Text h5>{text}</Text>
      <Text h6>{text}</Text>
    </>
  );
}
```
