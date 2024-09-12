"use client";

import { Carousel } from "@mantine/carousel";

const slideStyles = (backgroundColor: string) => ({
  backgroundColor,
  padding: 16,
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

export default function MyCarousel() {
  return (
    <Carousel withIndicators height={200}>
      <Carousel.Slide style={slideStyles("red")}>
        <h1>1</h1>
      </Carousel.Slide>
      <Carousel.Slide style={slideStyles("blue")}>
        <h1>2</h1>
      </Carousel.Slide>
      <Carousel.Slide style={slideStyles("green")}>
        <h1>3</h1>
      </Carousel.Slide>
      {/* ...other slides */}
    </Carousel>
  );
}
