import { configureStore } from "@reduxjs/toolkit";
import userAuth from "./slices/userAuthSlice";
import adminAuth from "./slices/adminAuthSlice";
import catalog from "./slices/catalogSlice";
import portal from "./slices/portalSlice";
import admin from "./slices/adminSlice";
import company from "./slices/companySlice";
import site from "./slices/siteSlice";

export const store = configureStore({
  reducer: { userAuth, adminAuth, catalog, portal, admin, company, site },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
