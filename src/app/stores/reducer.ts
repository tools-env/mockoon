import { Config } from 'src/app/config';
import { HighestMigrationId } from 'src/app/libs/migrations.lib';
import {
  ArrayContainsObjectKey,
  GetEditorModeFromContentType,
  GetRouteResponseContentType
} from 'src/app/libs/utils.lib';
import { ActiveEnvironmentsLogUUIDs, EnvironmentLogs } from 'src/app/models/environment-logs.model';
import { Toast } from 'src/app/services/toasts.service';
import { Actions, ActionTypes } from 'src/app/stores/actions';
import { DuplicatedRoutesTypes, EnvironmentsStatuses, StoreType } from 'src/app/stores/store';
import { Environment, Environments } from 'src/app/types/environment.type';
import { Route, RouteResponse } from 'src/app/types/route.type';

export type ReducerDirectionType = 'next' | 'previous';
export type ReducerIndexes = { sourceIndex: number; targetIndex: number };

export function environmentReducer(
  state: StoreType,
  action: Actions
): StoreType {
  let newState: StoreType;

  switch (action.type) {
    case ActionTypes.SET_ACTIVE_TAB: {
      newState = {
        ...state,
        activeTab: action.activeTab,
        environments: state.environments
      };
      break;
    }

    case ActionTypes.SET_ACTIVE_VIEW: {
      newState = {
        ...state,
        activeView: action.activeView,
        environments: state.environments
      };
      break;
    }

    case ActionTypes.SET_ACTIVE_ENVIRONMENT_LOG_TAB: {
      newState = {
        ...state,
        activeEnvironmentLogsTab: action.activeTab,
        environments: state.environments
      };
      break;
    }

    case ActionTypes.SET_INITIAL_ENVIRONMENTS: {
      const newEnvironments: Environments = action.environments;

      const newEnvironmentsStatus = newEnvironments.reduce<
        EnvironmentsStatuses
      >((environmentsStatus, environment) => {
        // create status and check if environment has not been migrated on a more recent Mockoon version
        environmentsStatus[environment.uuid] = {
          running: false,
          needRestart: false,
          disabledForIncompatibility:
            !!environment.lastMigration &&
            environment.lastMigration > HighestMigrationId
        };

        return environmentsStatus;
      }, {});

      // find first non disabled environment
      const activeEnvironment = newEnvironments.find((environment) => {
        return !newEnvironmentsStatus[environment.uuid]
          .disabledForIncompatibility;
      });

      newState = {
        ...state,
        activeEnvironmentUUID: activeEnvironment
          ? activeEnvironment.uuid
          : null,
        activeRouteUUID:
          activeEnvironment && activeEnvironment.routes.length
            ? activeEnvironment.routes[0].uuid
            : null,
        activeRouteResponseUUID:
          activeEnvironment &&
          activeEnvironment.routes.length &&
          activeEnvironment.routes[0].responses.length
            ? activeEnvironment.routes[0].responses[0].uuid
            : null,
        environments: newEnvironments,
        environmentsStatus: newEnvironmentsStatus,
        environmentsLogs: newEnvironments.reduce<EnvironmentLogs>(
          (environmentsLogs, environment) => {
            environmentsLogs[environment.uuid] = [];

            return environmentsLogs;
          },
          {}
        ),
        activeEnvironmentLogsUUID: newEnvironments.reduce<
          ActiveEnvironmentsLogUUIDs
        >((activeEnvironmentLogsUUID, environment) => {
          activeEnvironmentLogsUUID[environment.uuid] = null;

          return activeEnvironmentLogsUUID;
        }, {})
      };
      break;
    }

    case ActionTypes.SET_ACTIVE_ENVIRONMENT: {
      if (
        action.environmentUUID !== state.activeEnvironmentUUID &&
        !state.environmentsStatus[action.environmentUUID]
          .disabledForIncompatibility
      ) {
        const activeEnvironment = action.environmentUUID
          ? state.environments.find(
              (environment) => environment.uuid === action.environmentUUID
            )
          : state.environments[0];

        newState = {
          ...state,
          activeEnvironmentUUID: action.environmentUUID
            ? action.environmentUUID
            : activeEnvironment.uuid,
          activeRouteUUID: activeEnvironment.routes.length
            ? activeEnvironment.routes[0].uuid
            : null,
          activeRouteResponseUUID:
            activeEnvironment.routes.length &&
            activeEnvironment.routes[0].responses.length
              ? activeEnvironment.routes[0].responses[0].uuid
              : null,
          activeTab: 'RESPONSE',
          activeView: 'ROUTE',
          environments: state.environments
        };
        break;
      }

      newState = state;
      break;
    }

    case ActionTypes.NAVIGATE_ENVIRONMENTS: {
      const activeEnvironmentIndex = state.environments.findIndex(
        (environment) => environment.uuid === state.activeEnvironmentUUID
      );

      let newEnvironment;

      if (
        action.direction === 'next' &&
        activeEnvironmentIndex < state.environments.length - 1
      ) {
        newEnvironment = state.environments[activeEnvironmentIndex + 1];
      } else if (
        action.direction === 'previous' &&
        activeEnvironmentIndex > 0
      ) {
        newEnvironment = state.environments[activeEnvironmentIndex - 1];
      } else {
        newState = state;
        break;
      }

      if (
        state.environmentsStatus[newEnvironment.uuid].disabledForIncompatibility
      ) {
        newState = state;
        break;
      }

      newState = {
        ...state,
        activeEnvironmentUUID: newEnvironment.uuid,
        activeRouteUUID: newEnvironment.routes.length
          ? newEnvironment.routes[0].uuid
          : null,
        activeRouteResponseUUID:
          newEnvironment.routes.length &&
          newEnvironment.routes[0].responses.length
            ? newEnvironment.routes[0].responses[0].uuid
            : null,
        activeTab: 'RESPONSE',
        activeView: 'ROUTE',
        environments: state.environments
      };
      break;
    }

    case ActionTypes.MOVE_ENVIRONMENTS: {
      const newEnvironments = state.environments.slice();
      newEnvironments.splice(
        action.indexes.targetIndex,
        0,
        newEnvironments.splice(action.indexes.sourceIndex, 1)[0]
      );

      newState = {
        ...state,
        environments: newEnvironments
      };
      break;
    }

    case ActionTypes.MOVE_ROUTES: {
      // reordering routes need an environment restart
      const activeEnvironmentStatus =
        state.environmentsStatus[state.activeEnvironmentUUID];

      let needRestart: boolean;
      if (activeEnvironmentStatus.running) {
        needRestart = true;
      }

      const newEnvironments = state.environments.map((environment) => {
        if (environment.uuid === state.activeEnvironmentUUID) {
          const newRoutes = environment.routes.slice();
          newRoutes.splice(
            action.indexes.targetIndex,
            0,
            newRoutes.splice(action.indexes.sourceIndex, 1)[0]
          );

          return {
            ...environment,
            routes: newRoutes
          };
        }

        return environment;
      });

      newState = {
        ...state,
        environments: newEnvironments,
        environmentsStatus: {
          ...state.environmentsStatus,
          [state.activeEnvironmentUUID]: {
            ...activeEnvironmentStatus,
            needRestart
          }
        }
      };
      break;
    }

    case ActionTypes.MOVE_ROUTE_RESPONSES: {
      const newEnvironments = state.environments.map((environment) => {
        if (environment.uuid === state.activeEnvironmentUUID) {
          const newRoutes = environment.routes.map((route) => {
            if (route.uuid === state.activeRouteUUID) {
              const newRouteResponses = route.responses.slice();
              newRouteResponses.splice(
                action.indexes.targetIndex,
                0,
                newRouteResponses.splice(action.indexes.sourceIndex, 1)[0]
              );

              return {
                ...route,
                responses: newRouteResponses
              };
            }

            return route;
          });

          return {
            ...environment,
            routes: newRoutes
          };
        }

        return environment;
      });

      newState = {
        ...state,
        environments: newEnvironments
      };
      break;
    }

    case ActionTypes.SET_ACTIVE_ROUTE: {
      if (action.routeUUID !== state.activeRouteUUID) {
        const activeEnvironment = state.environments.find(
          (environment) => environment.uuid === state.activeEnvironmentUUID
        );
        const activeRoute = activeEnvironment.routes.find(
          (route) => route.uuid === action.routeUUID
        );

        newState = {
          ...state,
          activeRouteUUID: action.routeUUID,
          activeRouteResponseUUID: activeRoute.responses.length
            ? activeRoute.responses[0].uuid
            : null,
          activeTab: 'RESPONSE',
          activeView: 'ROUTE',
          environments: state.environments
        };
        break;
      }

      newState = state;
      break;
    }

    case ActionTypes.NAVIGATE_ROUTES: {
      const activeEnvironment = state.environments.find(
        (environment) => environment.uuid === state.activeEnvironmentUUID
      );
      const activeRouteIndex = activeEnvironment.routes.findIndex(
        (route) => route.uuid === state.activeRouteUUID
      );

      let newRoute;

      if (
        action.direction === 'next' &&
        activeRouteIndex < activeEnvironment.routes.length - 1
      ) {
        newRoute = activeEnvironment.routes[activeRouteIndex + 1];
      } else if (action.direction === 'previous' && activeRouteIndex > 0) {
        newRoute = activeEnvironment.routes[activeRouteIndex - 1];
      } else {
        newState = state;
        break;
      }

      newState = {
        ...state,
        activeRouteUUID: newRoute.uuid,
        activeRouteResponseUUID: newRoute.responses.length
          ? newRoute.responses[0].uuid
          : null,
        activeTab: 'RESPONSE',
        activeView: 'ROUTE',
        environments: state.environments
      };
      break;
    }

    case ActionTypes.ADD_ENVIRONMENT: {
      const newEnvironment: Environment = action.environment;
      const afterUUID = action.afterUUID;

      const environments = [...state.environments];

      let afterIndex = environments.length;
      if (afterUUID) {
        afterIndex = environments.findIndex(
          (environment) => environment.uuid === afterUUID
        );
        if (afterIndex === -1) {
          afterIndex = environments.length;
        }
      }
      environments.splice(afterIndex + 1, 0, newEnvironment);

      newState = {
        ...state,
        activeEnvironmentUUID: newEnvironment.uuid,
        activeRouteUUID: newEnvironment.routes[0].uuid,
        activeRouteResponseUUID: newEnvironment.routes[0].responses[0].uuid,
        activeTab: 'RESPONSE',
        activeView: 'ROUTE',
        environments,
        environmentsStatus: {
          ...state.environmentsStatus,
          [newEnvironment.uuid]: {
            running: false,
            needRestart: false,
            disabledForIncompatibility: false
          }
        },
        environmentsLogs: {
          ...state.environmentsLogs,
          [newEnvironment.uuid]: []
        },
        activeEnvironmentLogsUUID: {
          ...state.activeEnvironmentLogsUUID,
          [newEnvironment.uuid]: null
        }
      };
      break;
    }

    case ActionTypes.REMOVE_ENVIRONMENT: {
      const newEnvironments = state.environments.filter(
        (environment) => environment.uuid !== action.environmentUUID
      );
      const newEnvironmentsStatus = { ...state.environmentsStatus };
      delete newEnvironmentsStatus[action.environmentUUID];
      const newEnvironmentsLogs = { ...state.environmentsLogs };
      delete newEnvironmentsLogs[action.environmentUUID];
      const newActiveEnvironmentLogsUUID = {
        ...state.activeEnvironmentLogsUUID
      };
      delete newActiveEnvironmentLogsUUID[action.environmentUUID];

      newState = {
        ...state,
        environments: newEnvironments,
        environmentsStatus: newEnvironmentsStatus,
        environmentsLogs: newEnvironmentsLogs,
        activeEnvironmentLogsUUID: newActiveEnvironmentLogsUUID
      };

      if (state.activeEnvironmentUUID === action.environmentUUID) {
        if (
          newEnvironments.length &&
          !state.environmentsStatus[newEnvironments[0].uuid]
            .disabledForIncompatibility
        ) {
          newState = {
            ...newState,
            activeEnvironmentUUID: newEnvironments[0].uuid,
            activeRouteUUID: newEnvironments[0].routes.length
              ? newEnvironments[0].routes[0].uuid
              : null,
            activeRouteResponseUUID:
              newEnvironments[0].routes.length &&
              newEnvironments[0].routes[0].responses.length
                ? newEnvironments[0].routes[0].responses[0].uuid
                : null
          };
        } else {
          newState = {
            ...newState,
            activeEnvironmentUUID: null,
            activeRouteUUID: null,
            activeRouteResponseUUID: null
          };
        }
      }
      break;
    }

    case ActionTypes.UPDATE_ENVIRONMENT: {
      const propertiesNeedingRestart: (keyof Environment)[] = [
        'port',
        'endpointPrefix',
        'proxyMode',
        'proxyHost',
        'https',
        'cors',
        'headers',
        'proxyReqHeaders',
        'proxyResHeaders'
      ];
      const activeEnvironmentStatus =
        state.environmentsStatus[state.activeEnvironmentUUID];

      let needRestart: boolean;
      if (activeEnvironmentStatus.needRestart) {
        needRestart = true;
      } else {
        needRestart =
          ArrayContainsObjectKey(action.properties, propertiesNeedingRestart) &&
          activeEnvironmentStatus.running;
      }

      newState = {
        ...state,
        environments: state.environments.map((environment) => {
          if (environment.uuid === state.activeEnvironmentUUID) {
            return {
              ...environment,
              ...action.properties
            };
          }

          return environment;
        }),
        environmentsStatus: {
          ...state.environmentsStatus,
          [state.activeEnvironmentUUID]: {
            ...activeEnvironmentStatus,
            needRestart
          }
        }
      };
      break;
    }

    case ActionTypes.UPDATE_ENVIRONMENT_STATUS: {
      const newEnvironmentsStatus: EnvironmentsStatuses = {
        ...state.environmentsStatus
      };

      newEnvironmentsStatus[state.activeEnvironmentUUID] = {
        ...state.environmentsStatus[state.activeEnvironmentUUID],
        ...action.properties
      };

      newState = {
        ...state,
        environmentsStatus: newEnvironmentsStatus
      };
      break;
    }

    case ActionTypes.REMOVE_ROUTE: {
      const activeEnvironment = state.environments.find(
        (environment) => environment.uuid === state.activeEnvironmentUUID
      );
      const activeEnvironmentStatus =
        state.environmentsStatus[state.activeEnvironmentUUID];

      let needRestart: boolean;
      if (activeEnvironmentStatus.running) {
        needRestart = true;
      }

      const newRoutes = activeEnvironment.routes.filter(
        (route) => route.uuid !== action.routeUUID
      );

      const newEnvironments = state.environments.map((environment) => {
        if (environment.uuid === state.activeEnvironmentUUID) {
          return {
            ...environment,
            routes: newRoutes
          };
        }

        return environment;
      });

      newState = {
        ...state,
        environments: newEnvironments,
        environmentsStatus: {
          ...state.environmentsStatus,
          [state.activeEnvironmentUUID]: {
            ...activeEnvironmentStatus,
            needRestart
          }
        }
      };

      if (state.activeRouteUUID === action.routeUUID) {
        if (newRoutes.length) {
          newState.activeRouteUUID = newRoutes[0].uuid;
          newState.activeRouteResponseUUID = newRoutes[0].responses.length
            ? newRoutes[0].responses[0].uuid
            : null;
        } else {
          newState.activeRouteUUID = null;
          newState.activeRouteResponseUUID = null;
          newState.activeView = 'ENV_SETTINGS';
        }
      }
      break;
    }

    case ActionTypes.REMOVE_ROUTE_RESPONSE: {
      const activeEnvironment = state.environments.find(
        (environment) => environment.uuid === state.activeEnvironmentUUID
      );
      const activeRoute = activeEnvironment.routes.find(
        (route) => route.uuid === state.activeRouteUUID
      );
      const newRouteResponses = activeRoute.responses.filter(
        (routeResponse) => routeResponse.uuid !== state.activeRouteResponseUUID
      );

      const newEnvironments = state.environments.map((environment) => {
        if (environment.uuid === state.activeEnvironmentUUID) {
          return {
            ...environment,
            routes: environment.routes.map((route) => {
              if (route.uuid === state.activeRouteUUID) {
                return {
                  ...activeRoute,
                  responses: newRouteResponses
                };
              }

              return route;
            })
          };
        }

        return environment;
      });

      // no need to check if we have at least one route response because we cannot delete the last one anyway
      newState = {
        ...state,
        activeRouteResponseUUID: newRouteResponses[0].uuid,
        environments: newEnvironments
      };
      break;
    }

    case ActionTypes.ADD_ROUTE: {
      // only add a route if there is at least one environment
      if (state.environments.length > 0) {
        const activeEnvironmentStatus =
          state.environmentsStatus[state.activeEnvironmentUUID];

        let needRestart: boolean;
        if (activeEnvironmentStatus.running) {
          needRestart = true;
        }

        const newRoute = action.route;
        const afterUUID = action.afterUUID;

        newState = {
          ...state,
          activeRouteUUID: newRoute.uuid,
          activeRouteResponseUUID: newRoute.responses[0].uuid,
          activeTab: 'RESPONSE',
          activeView: 'ROUTE',
          environments: state.environments.map((environment) => {
            if (environment.uuid === state.activeEnvironmentUUID) {
              const routes = [...environment.routes];

              let afterIndex = routes.length;
              if (afterUUID) {
                afterIndex = environment.routes.findIndex(
                  (route) => route.uuid === afterUUID
                );
                if (afterIndex === -1) {
                  afterIndex = routes.length;
                }
              }
              routes.splice(afterIndex + 1, 0, newRoute);

              return {
                ...environment,
                routes
              };
            }

            return environment;
          }),
          environmentsStatus: {
            ...state.environmentsStatus,
            [state.activeEnvironmentUUID]: {
              ...activeEnvironmentStatus,
              needRestart
            }
          }
        };
        break;
      }

      newState = state;
      break;
    }

    case ActionTypes.UPDATE_ROUTE: {
      const propertiesNeedingRestart: (keyof Route)[] = [
        'endpoint',
        'method',
        'enabled'
      ];
      const activeEnvironmentStatus =
        state.environmentsStatus[state.activeEnvironmentUUID];
      let needRestart: boolean;
      const specifiedUUID = action.properties.uuid;

      if (activeEnvironmentStatus.needRestart) {
        needRestart = true;
      } else {
        needRestart =
          ArrayContainsObjectKey(action.properties, propertiesNeedingRestart) &&
          activeEnvironmentStatus.running;
      }

      newState = {
        ...state,
        environments: state.environments.map((environment) => {
          if (environment.uuid === state.activeEnvironmentUUID) {
            return {
              ...environment,
              routes: environment.routes.map((route) => {
                if (specifiedUUID) {
                  if (route.uuid === specifiedUUID) {
                    return {
                      ...route,
                      ...action.properties
                    };
                  }
                } else if (route.uuid === state.activeRouteUUID) {
                  return {
                    ...route,
                    ...action.properties
                  };
                }

                return route;
              })
            };
          }

          return environment;
        }),
        environmentsStatus: {
          ...state.environmentsStatus,
          [state.activeEnvironmentUUID]: {
            ...activeEnvironmentStatus,
            needRestart
          }
        }
      };
      break;
    }

    case ActionTypes.SET_ACTIVE_ROUTE_RESPONSE: {
      if (action.routeResponseUUID !== state.activeRouteResponseUUID) {
        newState = {
          ...state,
          activeRouteResponseUUID: action.routeResponseUUID
        };
        break;
      }

      newState = state;
      break;
    }

    case ActionTypes.ADD_ROUTE_RESPONSE: {
      const newRouteResponse: RouteResponse = action.routeResponse;
      newState = {
        ...state,
        activeRouteResponseUUID: newRouteResponse.uuid,
        activeTab: 'RESPONSE',
        environments: state.environments.map((environment) => {
          if (environment.uuid === state.activeEnvironmentUUID) {
            return {
              ...environment,
              routes: environment.routes.map((route) => {
                if (route.uuid === state.activeRouteUUID) {
                  const responses = [...route.responses];
                  if (action.isDuplication) {
                    const activeRouteResponseIndex = route.responses.findIndex(
                      (routeResponse: RouteResponse) => {
                        return (
                          routeResponse.uuid === state.activeRouteResponseUUID
                        );
                      }
                    );
                    responses.splice(
                      activeRouteResponseIndex + 1,
                      0,
                      newRouteResponse
                    );
                  } else {
                    responses.push(newRouteResponse);
                  }

                  return { ...route, responses };
                }

                return route;
              })
            };
          }

          return environment;
        })
      };
      break;
    }

    case ActionTypes.UPDATE_ROUTE_RESPONSE: {
      newState = {
        ...state,
        environments: state.environments.map((environment) => {
          if (environment.uuid === state.activeEnvironmentUUID) {
            return {
              ...environment,
              routes: environment.routes.map((route) => {
                if (route.uuid === state.activeRouteUUID) {
                  return {
                    ...route,
                    responses: route.responses.map((response) => {
                      if (response.uuid === state.activeRouteResponseUUID) {
                        return {
                          ...response,
                          ...action.properties
                        };
                      }

                      return response;
                    })
                  };
                }

                return route;
              })
            };
          }

          return environment;
        })
      };
      break;
    }

    case ActionTypes.LOG_REQUEST: {
      const newEnvironmentsLogs = { ...state.environmentsLogs };

      newEnvironmentsLogs[action.environmentUUID] = [
        ...newEnvironmentsLogs[action.environmentUUID]
      ];
      newEnvironmentsLogs[action.environmentUUID].unshift(action.logItem);

      // remove one at the end if we reach maximum
      if (
        newEnvironmentsLogs[action.environmentUUID].length >=
        Config.maxLogsPerEnvironment
      ) {
        newEnvironmentsLogs[action.environmentUUID].pop();
      }

      newState = {
        ...state,
        environmentsLogs: newEnvironmentsLogs
      };
      break;
    }

    case ActionTypes.CLEAR_LOGS: {
      newState = {
        ...state,
        environmentsLogs: {
          ...state.environmentsLogs,
          [action.environmentUUID]: []
        },
        activeEnvironmentLogsUUID: {
          ...state.activeEnvironmentLogsUUID,
          [action.environmentUUID]: null
        }
      };
      break;
    }

    case ActionTypes.SET_ACTIVE_ENVIRONMENT_LOG: {
      newState = {
        ...state,
        activeEnvironmentLogsUUID: {
          ...state.activeEnvironmentLogsUUID,
          [action.environmentUUID]: action.activeEnvironmentLogUUID
        }
      };
      break;
    }

    case ActionTypes.ADD_TOAST: {
      newState = {
        ...state,
        toasts: [...state.toasts, action.toast]
      };
      break;
    }

    case ActionTypes.REMOVE_TOAST: {
      newState = {
        ...state,
        toasts: state.toasts.filter((toast: Toast) => {
          return toast.UUID !== action.toastUUID;
        })
      };
      break;
    }

    case ActionTypes.SET_USER_ID: {
      newState = {
        ...state,
        userId: action.userId
      };
      break;
    }

    case ActionTypes.UPDATE_SETTINGS: {
      newState = {
        ...state,
        settings: { ...state.settings, ...action.properties }
      };
      break;
    }

    case ActionTypes.UPDATE_UI_STATE: {
      newState = {
        ...state,
        uiState: { ...state.uiState, ...action.properties }
      };
      break;
    }

    default:
      newState = state;
      break;
  }

  newState = {
    ...newState,
    bodyEditorConfig: {
      ...newState.bodyEditorConfig,
      mode: getBodyEditorMode(newState)
    },
    duplicatedEnvironments:
      action.type === ActionTypes.SET_INITIAL_ENVIRONMENTS ||
      action.type === ActionTypes.ADD_ENVIRONMENT ||
      action.type === ActionTypes.REMOVE_ENVIRONMENT ||
      action.type === ActionTypes.MOVE_ENVIRONMENTS ||
      (action.type === ActionTypes.UPDATE_ENVIRONMENT &&
        action.properties &&
        action.properties.port)
        ? updateDuplicatedEnvironments(newState)
        : newState.duplicatedEnvironments,
    duplicatedRoutes:
      action.type === ActionTypes.SET_INITIAL_ENVIRONMENTS ||
      action.type === ActionTypes.ADD_ROUTE ||
      action.type === ActionTypes.REMOVE_ROUTE ||
      action.type === ActionTypes.MOVE_ROUTES ||
      (action.type === ActionTypes.UPDATE_ROUTE &&
        action.properties &&
        (action.properties.endpoint || action.properties.method))
        ? updateDuplicatedRoutes(newState)
        : newState.duplicatedRoutes
  };

  return newState;
}

/**
 * Return the body editor "mode" from the currently selected env / route response
 *
 * @param state
 */
function getBodyEditorMode(state: StoreType) {
  const currentEnvironment = state.environments.find(
    (environment) => environment.uuid === state.activeEnvironmentUUID
  );
  const currentRoute =
    currentEnvironment &&
    currentEnvironment.routes.find(
      (route) => route.uuid === state.activeRouteUUID
    );
  const currentRouteResponse =
    currentEnvironment &&
    currentRoute &&
    currentRoute.responses.find(
      (response) => response.uuid === state.activeRouteResponseUUID
    );

  if (!currentEnvironment || !currentRoute || !currentRouteResponse) {
    return 'text';
  }

  const routeResponseContentType = GetRouteResponseContentType(
    currentEnvironment,
    currentRouteResponse
  );

  return GetEditorModeFromContentType(routeResponseContentType);
}

/**
 * List duplicated environments (sharing same port)
 *
 * @param state
 */
function updateDuplicatedEnvironments(state: StoreType): Set<string> {
  const duplicatedEnvironmentsUUIDs = new Set<string>();

  state.environments.forEach((environment, environmentIndex) => {
    // extract all environments with same port than current one
    state.environments.forEach(
      (otherEnvironment: Environment, otherEnvironmentIndex: number) => {
        if (
          otherEnvironmentIndex > environmentIndex &&
          otherEnvironment.port === environment.port
        ) {
          duplicatedEnvironmentsUUIDs.add(otherEnvironment.uuid);
        }
      }
    );
  });

  return duplicatedEnvironmentsUUIDs;
}

/**
 * List duplicated routes per environment (sharing same endpoint and method)
 *
 * @param state
 */
function updateDuplicatedRoutes(state: StoreType): DuplicatedRoutesTypes {
  const duplicatedRoutes: DuplicatedRoutesTypes = {};

  state.environments.forEach((environment) => {
    duplicatedRoutes[environment.uuid] = new Set();

    environment.routes.forEach((route: Route, routeIndex: number) => {
      environment.routes.forEach(
        (otherRoute: Route, otherRouteIndex: number) => {
          if (
            otherRouteIndex > routeIndex &&
            otherRoute.endpoint === route.endpoint &&
            otherRoute.method === route.method
          ) {
            duplicatedRoutes[environment.uuid].add(otherRoute.uuid);
          }
        }
      );
    });
  });

  return duplicatedRoutes;
}
