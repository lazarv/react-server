"use server";

function actionNewUser(prevState) {
  return {
    userCode: prevState.userCode === null ? 100000 : prevState.userCode + 1,
  };
}

export { actionNewUser };
