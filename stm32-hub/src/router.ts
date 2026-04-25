import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from './views/Dashboard.vue'
import ProjectDetail from './views/ProjectDetail.vue'
import Settings from './views/Settings.vue'
import Statistics from './views/Statistics.vue'
import Toolbox from './views/Toolbox.vue'
import CurveFit from './views/CurveFit.vue'
import SerialAssistant from './views/SerialAssistant.vue'
import Tutorials from './views/Tutorials.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: Dashboard },
    { path: '/stats', name: 'stats', component: Statistics },
    { path: '/serial', name: 'serial', component: SerialAssistant },
    { path: '/toolbox', name: 'toolbox', component: Toolbox },
    { path: '/curve-fit', name: 'curve-fit', component: CurveFit },
    { path: '/tutorials', name: 'tutorials', component: Tutorials },
    { path: '/project/:id', name: 'project', component: ProjectDetail, props: true },
    { path: '/settings', name: 'settings', component: Settings }
  ]
})

export default router
