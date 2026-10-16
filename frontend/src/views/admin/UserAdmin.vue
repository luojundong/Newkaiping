<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { User, Plus, Edit, Trash2, ShieldCheck } from 'lucide-vue-next'
import { userApi, roleApi } from '@/api'
import type { User as UserRow, UserRole, Role } from '@/types/api'
import {
  PERMISSION_OPTIONS,
  USER_ROLES,
} from '@/types/api'

const activeTab = ref<'user' | 'role'>('user')

// =====================================================
// 一、用户
// =====================================================
const loading = ref(false)
const rows = ref<UserRow[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(15)
const keyword = ref('')

const ROLE_MAP: Record<UserRole, { text: string; type: 'danger' | 'warning' | 'info' }> = {
  admin: { text: '管理员', type: 'danger' },
  operator: { text: '操作员', type: 'warning' },
  duty: { text: '值班员', type: 'warning' },
  viewer: { text: '访客', type: 'info' },
}

const dialogVisible = ref(false)
const dialogSaving = ref(false)
const editingId = ref<string | null>(null)
const formRef = ref()

interface UserForm {
  username: string
  name: string
  password: string
  role: UserRole
  permissions: string[]
  phone: string
  email: string
}
const emptyForm = (): UserForm => ({
  username: '',
  name: '',
  password: '',
  role: 'operator',
  permissions: [],
  phone: '',
  email: '',
})
const form = reactive(emptyForm())

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  password: [
    {
      validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
        if (!editingId.value && !v) cb(new Error('创建用户需设置初始密码'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

async function loadUsers() {
  loading.value = true
  try {
    const res = await userApi.list({
      page: page.value,
      limit: limit.value,
      keyword: keyword.value || undefined,
    })
    rows.value = res.items as unknown as UserRow[]
    total.value = res.total
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  loadUsers()
}

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  dialogVisible.value = true
}

function openEdit(u: UserRow) {
  editingId.value = u.id
  Object.assign(form, {
    username: u.username,
    name: u.name || '',
    password: '',
    role: u.role,
    permissions: [...(u.permissions || [])],
    phone: u.phone || '',
    email: u.email || '',
  })
  dialogVisible.value = true
}

async function submit() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  dialogSaving.value = true
  const body: Record<string, unknown> = {
    username: form.username,
    name: form.name,
    role: form.role,
    permissions: form.permissions,
    phone: form.phone || undefined,
    email: form.email || undefined,
  }
  if (form.password) body.password = form.password
  try {
    if (editingId.value) {
      await userApi.update(editingId.value, body)
      ElMessage.success('用户已更新')
    } else {
      await userApi.create(body)
      ElMessage.success('用户已创建')
    }
    dialogVisible.value = false
    loadUsers()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    dialogSaving.value = false
  }
}

async function remove(u: UserRow) {
  try {
    await ElMessageBox.confirm(`确认删除用户「${u.name || u.username}」？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await userApi.remove(u.id)
    ElMessage.success('用户已删除')
    loadUsers()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

// =====================================================
// 二、角色
// =====================================================
const roleLoading = ref(false)
const roles = ref<Role[]>([])
const roleDialog = ref(false)
const roleSaving = ref(false)
const roleEditingId = ref<string | null>(null)
const roleFormRef = ref()

interface RoleForm {
  code: string
  name: string
  permissions: string[]
  description: string
}
const emptyRoleForm = (): RoleForm => ({ code: '', name: '', permissions: [], description: '' })
const roleForm = reactive(emptyRoleForm())

const roleRules = {
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
}

async function loadRoles() {
  roleLoading.value = true
  try {
    const res = (await roleApi.list()) as unknown as Role[]
    roles.value = res
  } catch {
    roles.value = []
  } finally {
    roleLoading.value = false
  }
}

function openRoleCreate() {
  roleEditingId.value = null
  Object.assign(roleForm, emptyRoleForm())
  roleDialog.value = true
}

function openRoleEdit(r: Role) {
  roleEditingId.value = r.id
  Object.assign(roleForm, {
    code: r.code,
    name: r.name,
    permissions: [...(r.permissions || [])],
    description: r.description || '',
  })
  roleDialog.value = true
}

async function submitRole() {
  if (!roleFormRef.value) return
  try {
    await roleFormRef.value.validate()
  } catch {
    return
  }
  roleSaving.value = true
  const body: Record<string, unknown> = {
    code: roleForm.code,
    name: roleForm.name,
    permissions: roleForm.permissions,
    description: roleForm.description || undefined,
  }
  try {
    if (roleEditingId.value) {
      await roleApi.update(roleEditingId.value, body)
      ElMessage.success('角色已更新')
    } else {
      await roleApi.create(body)
      ElMessage.success('角色已创建')
    }
    roleDialog.value = false
    loadRoles()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    roleSaving.value = false
  }
}

async function removeRole(r: Role) {
  try {
    await ElMessageBox.confirm(`确认删除角色「${r.name}」（${r.code}）？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await roleApi.remove(r.id)
    ElMessage.success('角色已删除')
    loadRoles()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

onMounted(() => {
  loadUsers()
  loadRoles()
})
</script>

<template>
  <div class="admin-page">
    <el-tabs v-model="activeTab" class="user-tabs">
      <!-- 用户 -->
      <el-tab-pane label="用户" name="user">
        <div class="admin-toolbar">
          <User :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">用户管理</span>
          <div class="admin-toolbar__filters">
            <el-input
              v-model="keyword"
              placeholder="搜索账号/姓名"
              clearable
              style="width: 200px"
              @keyup.enter="onSearch"
              @clear="onSearch"
            />
            <el-button @click="onSearch">查询</el-button>
            <el-button type="primary" :icon="Plus" @click="openCreate">新增用户</el-button>
          </div>
        </div>

        <el-table :data="rows" v-loading="loading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ (page - 1) * limit + $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="username" label="账号" width="150" />
          <el-table-column prop="name" label="姓名" width="120" />
          <el-table-column label="角色" width="110">
            <template #default="{ row }">
              <el-tag :type="ROLE_MAP[row.role as UserRole]?.type || 'info'" size="small">
                {{ ROLE_MAP[row.role as UserRole]?.text || row.role }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="权限" min-width="220">
            <template #default="{ row }">
              <el-tag v-for="p in (row.permissions || [])" :key="p" size="small" class="perm-tag">
                {{ PERMISSION_OPTIONS.find((o) => o.value === p)?.label || p }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" width="140" />
          <el-table-column prop="email" label="邮箱" min-width="170" show-overflow-tooltip />
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="remove(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="admin-pager">
          <el-pagination
            v-model:current-page="page"
            :page-size="limit"
            :total="total"
            layout="total, prev, pager, next"
            background
          />
        </div>
      </el-tab-pane>

      <!-- 角色 -->
      <el-tab-pane label="角色" name="role">
        <div class="admin-toolbar">
          <ShieldCheck :size="18" class="admin-toolbar__icon" />
          <span class="admin-toolbar__title">角色管理</span>
          <div class="admin-toolbar__filters">
            <el-button type="primary" :icon="Plus" @click="openRoleCreate">新增角色</el-button>
          </div>
        </div>

        <el-table :data="roles" v-loading="roleLoading" class="admin-table" height="100%">
          <el-table-column label="序号" width="64" class-name="seq-col" fixed>
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column prop="code" label="角色编码" width="160" />
          <el-table-column prop="name" label="角色名称" width="160" />
          <el-table-column label="权限" min-width="260">
            <template #default="{ row }">
              <el-tag v-for="p in (row.permissions || [])" :key="p" size="small" class="perm-tag">
                {{ PERMISSION_OPTIONS.find((o) => o.value === p)?.label || p }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <span class="kp-action-link" @click="openRoleEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="removeRole(row)">删除</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 用户对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑用户' : '新增用户'"
      width="600px"
      append-to-body
      class="kp-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="88px" class="user-form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="账号" prop="username">
              <el-input v-model="form.username" :disabled="!!editingId" placeholder="登录账号" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="form.name" placeholder="真实姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="密码" prop="password">
              <el-input
                v-model="form.password"
                type="password"
                show-password
                :placeholder="editingId ? '留空则不修改' : '初始密码'"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色" prop="role">
              <el-select v-model="form.role" style="width: 100%">
                <el-option v-for="r in USER_ROLES" :key="r" :label="ROLE_MAP[r].text" :value="r" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="手机号">
              <el-input v-model="form.phone" placeholder="选填" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="邮箱">
              <el-input v-model="form.email" placeholder="选填" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="权限">
          <el-checkbox-group v-model="form.permissions">
            <el-checkbox v-for="p in PERMISSION_OPTIONS" :key="p.value" :value="p.value" border>
              {{ p.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogSaving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 角色对话框 -->
    <el-dialog
      v-model="roleDialog"
      :title="roleEditingId ? '编辑角色' : '新增角色'"
      width="560px"
      append-to-body
      class="kp-dialog"
    >
      <el-form ref="roleFormRef" :model="roleForm" :rules="roleRules" label-width="88px" class="role-form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="角色编码" prop="code">
              <el-input v-model="roleForm.code" :disabled="!!roleEditingId" placeholder="如 energy_admin" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色名称" prop="name">
              <el-input v-model="roleForm.name" placeholder="如 能源管理员" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="权限点">
          <el-checkbox-group v-model="roleForm.permissions">
            <el-checkbox v-for="p in PERMISSION_OPTIONS" :key="p.value" :value="p.value" border>
              {{ p.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="roleForm.description" type="textarea" :rows="3" placeholder="角色职责说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialog = false">取消</el-button>
        <el-button type="primary" :loading="roleSaving" @click="submitRole">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.user-tabs { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.user-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; }
.user-tabs :deep(.el-tab-pane) { height: 100%; display: flex; flex-direction: column; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; }
.admin-table { flex: 1; min-height: 0; }
.admin-pager { display: flex; justify-content: flex-end; }
.perm-tag { margin: 0 4px 4px 0; }
</style>
