import { faker } from "@faker-js/faker";

export type Photo = {
  id: string;
  username: string;
  imageSrc: string;
};

const photos: Photo[] = Array.from({ length: 9 }, (_, index) => ({
  id: `${index}`,
  username: faker.internet.userName(),
  imageSrc: process.env.CI ? "/placeholder.svg" : faker.image.urlPicsumPhotos(),
}));

export default photos;
