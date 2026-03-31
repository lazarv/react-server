/**
 * Router definition — binds route descriptors to components and resources.
 *
 * Separated from App.tsx so the layout is pure presentation.
 * Resource mappings come from resources/mappings.ts.
 */
import { createRoute, createRouter } from "@lazarv/react-server/router";

import * as routes from "./routes";
import {
  userByIdMapping,
  currentUser,
  postBySlugMapping,
  todosServerMapping,
} from "./resources/mappings";
import { todosClientMapping } from "./resources/todos/client";

import Home from "./Home";
import About from "./About";
import UserPage from "./UserPage";
import PostPage from "./PostPage";
import ProductList from "./ProductList";
import TodosPage from "./TodosPage";
import TodosLoading from "./TodosLoading";
import NotFound from "./NotFound";
import UserNotFound from "./UserNotFound";

const router = createRouter({
  home: createRoute(routes.home, <Home />),
  about: createRoute(routes.about, <About />),
  user: createRoute(routes.user, <UserPage />, {
    resources: [userByIdMapping, currentUser],
  }),
  post: createRoute(routes.post, <PostPage />, {
    resources: [postBySlugMapping],
  }),
  products: createRoute(routes.products, <ProductList />),
  todos: createRoute(routes.todosRoute, <TodosPage />, {
    // Server binding loads data on initial request; client binding
    // (todosClientMapping) passes through RSC for client-only navigation.
    loading: TodosLoading,
    resources: [todosServerMapping, todosClientMapping],
  }),
  userNotFound: createRoute(routes.userNotFound, <UserNotFound />),
  notFound: createRoute(routes.notFound, <NotFound />),
});

export default router;
