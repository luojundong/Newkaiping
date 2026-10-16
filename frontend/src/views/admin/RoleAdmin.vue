<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ShieldCheck, Plus, Edit, Trash2 } from 'lucide-vue-next'
import { roleApi } from '@/api'
import type { Role } from '@/types/api'
import { PERMISSION_OPTIONS } from '@/types/api'

const loading = ref(false)
const rows = ref<Role[]>([])

const dialogVisible = ref(false)
const dialogSaving = ref(false)
const editingId = ref<string | null>(null)
const formRef = ref()

interface RoleForm {
  code: string
  name: string
  permissions: string[]
  description: string
}
const emptyForm = (): RoleForm => ({ code: '', name: '', permissions: [], description: '' })
const form = reactive(emptyForm())

const rules = {
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
}

async function load() {
  loading.value = true
  try {
    const res = (await roleApi.list()) as unknown as Role[]
    rows.value = res
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, emptyForm())
  dialogVisible.value = true
}

function openEdit(r: Role) {
  editingId.value = r.id
  Object.assign(form, {
    code: r.code,
    name: r.name,
    permissions: [...(r.permissions || [])],
    description: r.description || '',
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
    code: form.code,
    name: form.name,
    permissions: form.permissions,
    description: form.description || undefined,
  }
  try {
    if (editingId.value) {
      await roleApi.update(editingId.value, body)
      ElMessage.success('角色已更新')
    } else {
      await roleApi.create(body)
      ElMessage.success('角色已创建')
    }
    dialogVisible.value = false
    load()
  } catch (e) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    dialogSaving.value = false
  }
}

async function remove(r: Role) {
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
    load()
  } catch (e) {
    ElMessage.error((e as Error).message || '删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="admin-page">
    <div class="admin-toolbar">
      <ShieldCheck :size="18" class="admin-toolbar__icon" />
      <span class="admin-toolbar__title">角色管理</span>
      <div class="admin-toolbar__filters">
        <el-button type="primary" :icon="Plus" @click="openCreate">新增角色</el-button>
      </div>
    </div>

    <el-table :data="rows" v-loading="loading" class="admin-table" height="100%">
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
              <span class="kp-action-link" @click="openEdit(row)">编辑</span>
              <span class="kp-sep" />
              <span class="kp-action-link kp-action-link--danger" @click="remove(row)">删除</span>
            </template>
          </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑角色' : '新增角色'"
      width="560px"
      append-to-body
      class="kp-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="88px" class="role-form">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="角色编码" prop="code">
              <el-input v-model="form.code" :disabled="!!editingId" placeholder="如 energy_admin" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色名称" prop="name">
              <el-input v-model="form.name" placeholder="如 能源管理员" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="权限点">
          <el-checkbox-group v-model="form.permissions">
            <el-checkbox v-for="p in PERMISSION_OPTIONS" :key="p.value" :value="p.value" border>
              {{ p.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="角色职责说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogSaving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-page { display: flex; flex-direction: column; height: 100%; gap: 14px; }
.admin-toolbar { display: flex; align-items: center; gap: 10px; }
.admin-toolbar__icon { color: var(--kp-accent); }
.admin-toolbar__title { font-size: var(--kp-text-lg); font-weight: 510; letter-spacing: var(--kp-tracking-label); }
.admin-toolbar__filters { margin-left: auto; display: flex; gap: 10px; }
.admin-table { flex: 1; min-height: 0; }
.perm-tag { margin: 0 4px 4px 0; }
</style>
