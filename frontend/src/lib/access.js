export function getPermissionList(user) {
  return Array.isArray(user?.permissions) ? user.permissions : [];
}

export function hasPermission(user, permissionKey) {
  if (!permissionKey) return true;
  if (String(user?.role || "").toUpperCase() === "SUPER_ADMIN") return true;
  return getPermissionList(user).includes(permissionKey);
}

export function hasAnyPermission(user, permissionKeys = []) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys.filter(Boolean) : [];
  if (!keys.length) return true;
  if (String(user?.role || "").toUpperCase() === "SUPER_ADMIN") return true;
  const granted = new Set(getPermissionList(user));
  return keys.some((key) => granted.has(key));
}
